'use server';

import { revalidatePath } from 'next/cache';
import type { InboxChannelKind, InboxMessageStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { enqueue } from '@/lib/jobs/queue';
import { storeCredential } from '@/lib/crypto/vault';
import { syncChannelCore } from '@/lib/inbox/sync';
import { runInboxIngest } from '@/lib/inbox/ingest';
import { draftQuoteFromEnquiry } from '@/actions/enquiry';

const INBOX_PATH = '/dashboard/inbox';

export type InboxMessageView = {
  id: string;
  channelName: string;
  channelKind: InboxChannelKind;
  fromName: string | null;
  fromAddress: string | null;
  subject: string | null;
  body: string;
  receivedAt: Date;
  status: InboxMessageStatus;
  category: string | null;
  summary: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
};

export async function listChannels(tenantId: string) {
  return prisma.inboxChannel.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, kind: true, identifier: true, status: true, lastSyncedAt: true, lastError: true },
  });
}

export async function listMessages(tenantId: string, status?: InboxMessageStatus): Promise<InboxMessageView[]> {
  const rows = await prisma.inboxMessage.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
    orderBy: { receivedAt: 'desc' },
    take: 200,
    include: { channel: { select: { name: true, kind: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    channelName: m.channel.name,
    channelKind: m.channel.kind,
    fromName: m.fromName,
    fromAddress: m.fromAddress,
    subject: m.subject,
    body: m.body,
    receivedAt: m.receivedAt,
    status: m.status,
    category: m.category,
    summary: m.summary,
    linkedEntityType: m.linkedEntityType,
    linkedEntityId: m.linkedEntityId,
  }));
}

/** Unread count for the sidebar badge. */
export async function countUnread(tenantId: string): Promise<number> {
  return prisma.inboxMessage.count({ where: { tenantId, status: 'unread' } });
}

export async function createChannel(input: { kind: InboxChannelKind; name: string; identifier?: string }) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'inbox:write')) throw new Error('You do not have permission to manage the inbox');
  const name = input.name.trim();
  if (!name) throw new Error('Give the channel a name');

  const channel = await prisma.inboxChannel.create({
    data: {
      tenantId: session.tenantId,
      kind: input.kind,
      name,
      identifier: input.identifier?.trim() || null,
      createdByUserId: session.userId,
    },
    select: { id: true, name: true },
  });

  await writeAudit({
    session,
    collection: 'inbox_channels',
    documentId: channel.id,
    action: 'create',
    summary: `Connected inbox channel "${channel.name}" (${input.kind})`,
  });

  revalidatePath(INBOX_PATH);
  return channel;
}

/**
 * Store (or replace) the vault credential a credentialed channel pulls with — e.g. a Gmail
 * `{ refresh_token, client_id, client_secret }` JSON blob. The secret is envelope-encrypted at rest by the
 * vault and never returned to the client. Keyed by (tenantId, channel.kind, channel.account) so it lines up
 * with what getInboxProvider().fetch() reads. Manual channels have no credential and are rejected.
 */
export async function connectChannelCredential(input: { channelId: string; secret: string }) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'inbox:write')) throw new Error('You do not have permission to manage the inbox');
  const secret = input.secret.trim();
  if (!secret) throw new Error('Paste the channel credential');

  const channel = await prisma.inboxChannel.findFirst({
    where: { id: input.channelId, tenantId: session.tenantId },
    select: { id: true, kind: true, account: true, name: true },
  });
  if (!channel) throw new Error('Unknown channel');
  if (channel.kind === 'manual') throw new Error('The manual channel has no credential to connect');

  await storeCredential({ tenantId: session.tenantId, kind: channel.kind, account: channel.account, secret });
  // A freshly (re)connected channel clears any prior error so the next sync is attempted cleanly.
  await prisma.inboxChannel.update({ // tenant-safe: channelId verified tenant-owned via findFirst above
    where: { id: channel.id },
    data: { status: 'active', lastError: null },
  });

  await writeAudit({
    session,
    collection: 'inbox_channels',
    documentId: channel.id,
    action: 'update',
    summary: `Connected credential for inbox channel "${channel.name}" (${channel.kind})`,
  });

  revalidatePath(INBOX_PATH);
  return { ok: true };
}

/**
 * Drop one inbound message into the inbox. This is the manual/paste path today and the same entry point a
 * live provider webhook would call. Creates the row, then enqueues classification so the UI returns instantly
 * and the intent/summary fill in shortly after.
 */
export async function ingestMessage(input: {
  channelId: string;
  fromName?: string;
  fromAddress?: string;
  subject?: string;
  body: string;
  externalMessageId?: string;
}) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'inbox:write')) throw new Error('You do not have permission to manage the inbox');
  const body = input.body.trim();
  if (!body) throw new Error('The message body is empty');

  const channel = await prisma.inboxChannel.findFirst({
    where: { id: input.channelId, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!channel) throw new Error('Unknown channel');

  const message = await prisma.inboxMessage.create({
    data: {
      tenantId: session.tenantId,
      channelId: channel.id,
      externalMessageId: input.externalMessageId ?? null,
      fromName: input.fromName?.trim() || null,
      fromAddress: input.fromAddress?.trim() || null,
      subject: input.subject?.trim() || null,
      body,
    },
    select: { id: true },
  });

  await enqueue({ tenantId: session.tenantId, kind: 'inbox.ingest', payload: { messageId: message.id } });

  revalidatePath(INBOX_PATH);
  return { id: message.id };
}

/** Run classification inline (for the "classify now" button when no worker is polling in dev). */
export async function classifyNow(messageId: string) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'inbox:write')) throw new Error('You do not have permission to manage the inbox');
  await runInboxIngest(messageId, session.tenantId);
  revalidatePath(INBOX_PATH);
}

export async function setMessageStatus(messageId: string, status: InboxMessageStatus) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'inbox:write')) throw new Error('You do not have permission to manage the inbox');
  const result = await prisma.inboxMessage.updateMany({
    where: { id: messageId, tenantId: session.tenantId },
    data: { status },
  });
  if (result.count === 0) throw new Error('Unknown message');
  revalidatePath(INBOX_PATH);
}

/**
 * Convert a buyer-enquiry message into the CRM: reuse the paste-enquiry chain (dedupe/create Buyer + Lead,
 * seed a draft Quote), then link this message to the resulting lead and mark it triaged. The heavy structured
 * extraction lives in one place (draftQuoteFromEnquiry); the inbox just feeds it the message text.
 */
export async function triageToLead(messageId: string) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'inbox:write')) throw new Error('You do not have permission to manage the inbox');

  const message = await prisma.inboxMessage.findFirst({
    where: { id: messageId, tenantId: session.tenantId },
    select: { id: true, subject: true, body: true, status: true },
  });
  if (!message) throw new Error('Unknown message');
  if (message.status === 'triaged') throw new Error('This message has already been triaged');

  const rawText = [message.subject, message.body].filter(Boolean).join('\n\n');
  const draft = await draftQuoteFromEnquiry(rawText);

  await prisma.inboxMessage.update({ // tenant-safe: messageId verified tenant-owned via findFirst above
    where: { id: message.id },
    data: {
      status: 'triaged',
      linkedEntityType: 'lead',
      linkedEntityId: draft.leadId,
      triagedByUserId: session.userId,
      triagedAt: new Date(),
    },
  });

  await writeAudit({
    session,
    collection: 'inbox_messages',
    documentId: message.id,
    action: 'status_change',
    summary: `Triaged inbox message into lead + draft quote ${draft.quoteNumber} (${draft.buyerName})`,
    after: { leadId: draft.leadId, quoteId: draft.quoteId },
  });

  revalidatePath(INBOX_PATH);
  return draft;
}

/**
 * Pull new messages from a channel's provider. The manual provider returns nothing (it is fed by paste/
 * webhook); credentialed providers throw ProviderNotConfiguredError until their connector is wired, which we
 * record on the channel rather than surfacing as a crash.
 */
export async function syncChannel(channelId: string) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'inbox:write')) throw new Error('You do not have permission to manage the inbox');

  const result = await syncChannelCore(channelId, session.tenantId);
  revalidatePath(INBOX_PATH);
  return result;
}
