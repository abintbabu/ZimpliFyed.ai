'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { writeDomainEvent } from '@/lib/domain-events';
import { approveAiInteraction } from '@/ai/approval';
import { sendWhatsAppTemplate, parseWhatsAppSendPayload, WhatsAppSendError } from '@/lib/whatsapp/send';
import { sendGmailReply, parseGmailReplyPayload, GmailSendError } from '@/lib/inbox/gmail-send';
import { isFeatureEnabled } from '@/lib/feature-flags';
import type { Prisma } from '@prisma/client';

/**
 * Action Queue consumer side (CPO_PRODUCT_PLAN §3.10, v2 keystone). The founder's day is the queue:
 * one approve / edit / reject inbox over every AI-proposed action. Approve is the L1 human-approval gate
 * (PRODUCT_PLAN §6) — it consumes the underlying runAi draft so a draft can only drive one external effect.
 */

/** Pending items, newest first, grouped-ready for the queue UI. Snoozed items reappear once their time passes. */
export async function listActionQueue(tenantId: string) {
  return prisma.actionQueueItem.findMany({
    where: {
      tenantId,
      OR: [{ status: 'pending' }, { status: 'snoozed', snoozedUntil: { lte: new Date() } }],
    },
    orderBy: [{ confidence: 'asc' }, { createdAt: 'desc' }],
  });
}

async function loadPendingItem(itemId: string, tenantId: string) {
  const item = await prisma.actionQueueItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) throw new Error('Action not found');
  if (item.status === 'approved' || item.status === 'rejected' || item.status === 'done') {
    throw new Error('This action has already been decided');
  }
  return item;
}

/**
 * Approve an action. When it carries an AI draft, the single-shot approval gate is taken first so the same
 * draft can't be approved twice. Optionally accepts an edited payload (edit-and-approve is one decision).
 */
export async function approveAction(itemId: string, editedPayload?: Prisma.InputJsonValue): Promise<void> {
  const session = await requireTenantSession();
  const { tenantId, userId, role } = session;
  if (!hasPermission(role, 'action_queue:approve')) throw new Error('You do not have permission to approve actions');

  const item = await loadPendingItem(itemId, tenantId);

  if (item.aiInteractionId) {
    // Single-shot gate taken BEFORE any external effect, so a reused draft can never send twice.
    await approveAiInteraction({ interactionId: item.aiInteractionId, tenantId, userId, requireUnused: true });
  }

  // WhatsApp template sends (ROADMAP §7 item 3): the approve click IS the send trigger — outbound
  // WhatsApp exists only behind this gate, never as a free-compose surface (CPO decision 2026-08-31).
  // sendWhatsAppTemplate enforces the DPDP consent gate; a blocked/failed send leaves the item pending
  // and leaves an audit trail rather than silently dropping.
  const effectivePayload = editedPayload !== undefined ? editedPayload : item.payload;
  const waSend = parseWhatsAppSendPayload(effectivePayload);
  if (waSend) {
    try {
      const { messageId } = await sendWhatsAppTemplate({ tenantId, ...waSend });
      await writeDomainEvent(prisma, {
        tenantId,
        type: 'whatsapp.template_sent',
        refId: item.id,
        payload: { template: waSend.template, to: waSend.to, messageId },
      });
    } catch (err) {
      const reason = err instanceof WhatsAppSendError ? err.code : 'unknown_error';
      const detail = err instanceof Error ? err.message : String(err);
      await writeAudit({
        session,
        collection: 'action_queue',
        documentId: item.id,
        action: 'update',
        summary: `WhatsApp send blocked (${reason}): ${item.title} — ${detail}`,
      });
      throw new Error(
        reason === 'consent_missing'
          ? `Cannot send: no WhatsApp consent on record for ${waSend.to}. Record consent first, then approve again.`
          : `WhatsApp send failed (${reason}). The action is still pending — fix the issue and approve again.`,
      );
    }
  }

  // Gmail reply-in-thread (ROADMAP §7 item 5): same approve-is-send pattern as WhatsApp above, additionally
  // gated on the per-tenant CASA-review feature flag — a flow can be built and reviewed before its CASA
  // scopes are approved, but it can never actually send until the flag is flipped on for that tenant.
  const gmailReply = parseGmailReplyPayload(effectivePayload);
  if (gmailReply) {
    if (!(await isFeatureEnabled(tenantId, 'gmail_reply'))) {
      throw new Error('Gmail reply-in-thread is not enabled for this workspace yet');
    }
    try {
      const { messageId } = await sendGmailReply({ tenantId, ...gmailReply });
      await writeDomainEvent(prisma, {
        tenantId,
        type: 'action.approved',
        refId: item.id,
        payload: { kind: item.kind, edited: editedPayload !== undefined, gmailMessageId: messageId },
      });
    } catch (err) {
      const reason = err instanceof GmailSendError ? err.code : 'unknown_error';
      const detail = err instanceof Error ? err.message : String(err);
      await writeAudit({
        session,
        collection: 'action_queue',
        documentId: item.id,
        action: 'update',
        summary: `Gmail reply blocked (${reason}): ${item.title} — ${detail}`,
      });
      throw new Error(`Gmail reply failed (${reason}). The action is still pending — fix the issue and approve again.`);
    }
  }

  await prisma.actionQueueItem.update({ // tenant-safe: item verified tenant-owned via loadPendingItem findFirst above
    where: { id: item.id },
    data: {
      status: 'approved',
      decidedByUserId: userId,
      decidedAt: new Date(),
      editedOnApprove: editedPayload !== undefined,
      ...(editedPayload !== undefined ? { payload: editedPayload } : {}),
    },
  });

  await writeAudit({
    session,
    collection: 'action_queue',
    documentId: item.id,
    action: 'update',
    summary: `Approved AI action: ${item.title}${editedPayload !== undefined ? ' (edited)' : ''}`,
  });
  await writeDomainEvent(prisma, {
    tenantId,
    type: 'action.approved',
    refId: item.id,
    payload: { kind: item.kind, edited: editedPayload !== undefined },
  });

  revalidatePath('/dashboard/action-queue');
}

/** Reject an action. Kept as a row (not deleted) so the AiFeedback / L-promotion signal survives. */
export async function rejectAction(itemId: string): Promise<void> {
  const session = await requireTenantSession();
  const { tenantId, userId, role } = session;
  if (!hasPermission(role, 'action_queue:approve')) throw new Error('You do not have permission to decide actions');

  const item = await loadPendingItem(itemId, tenantId);

  await prisma.actionQueueItem.update({ // tenant-safe: item verified tenant-owned via loadPendingItem findFirst above
    where: { id: item.id },
    data: { status: 'rejected', decidedByUserId: userId, decidedAt: new Date() },
  });

  await writeAudit({ session, collection: 'action_queue', documentId: item.id, action: 'update', summary: `Rejected AI action: ${item.title}` });
  await writeDomainEvent(prisma, { tenantId, type: 'action.rejected', refId: item.id, payload: { kind: item.kind } });

  revalidatePath('/dashboard/action-queue');
}

/** Snooze an action out of the queue for a number of days; it reappears when the time passes. */
export async function snoozeAction(itemId: string, days: number): Promise<void> {
  const session = await requireTenantSession();
  const { tenantId, userId, role } = session;
  if (!hasPermission(role, 'action_queue:approve')) throw new Error('You do not have permission to decide actions');

  const item = await loadPendingItem(itemId, tenantId);
  const snoozedUntil = new Date(Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000);

  await prisma.actionQueueItem.update({ // tenant-safe: item verified tenant-owned via loadPendingItem findFirst above
    where: { id: item.id },
    data: { status: 'snoozed', snoozedUntil, decidedByUserId: userId },
  });

  await writeAudit({ session, collection: 'action_queue', documentId: item.id, action: 'update', summary: `Snoozed AI action ${days}d: ${item.title}` });
  revalidatePath('/dashboard/action-queue');
}
