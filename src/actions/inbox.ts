'use server';

import { revalidatePath } from 'next/cache';
import type { InboxChannelKind, InboxMessageStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { enqueue } from '@/lib/jobs/queue';
import { getInboxProvider, ProviderNotConfiguredError } from '@/lib/inbox/provider';
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

  await prisma.inboxMessage.update({
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

  const channel = await prisma.inboxChannel.findFirst({
    where: { id: channelId, tenantId: session.tenantId },
    select: { id: true, kind: true, account: true, lastSyncCursor: true },
  });
  if (!channel) throw new Error('Unknown channel');

  const provider = getInboxProvider(channel.kind);
  if (!provider.canPull) {
    revalidatePath(INBOX_PATH);
    return { fetched: 0, pullable: false };
  }

  try {
    const { messages, cursor } = await provider.fetch({
      tenantId: session.tenantId,
      account: channel.account,
      cursor: channel.lastSyncCursor,
    });

    let created = 0;
    for (const m of messages) {
      const row = await prisma.inboxMessage.upsert({
        where: { channelId_externalMessageId: { channelId: channel.id, externalMessageId: m.externalMessageId } },
        create: {
          tenantId: session.tenantId,
          channelId: channel.id,
          externalMessageId: m.externalMessageId,
          fromName: m.fromName ?? null,
          fromAddress: m.fromAddress ?? null,
          subject: m.subject ?? null,
          body: m.body,
          receivedAt: m.receivedAt,
        },
        update: {}, // already ingested — dedupe
        select: { id: true, category: true },
      });
      if (!row.category) {
        created += 1;
        await enqueue({ tenantId: session.tenantId, kind: 'inbox.ingest', payload: { messageId: row.id } });
      }
    }

    await prisma.inboxChannel.update({
      where: { id: channel.id },
      data: { lastSyncCursor: cursor, lastSyncedAt: new Date(), status: 'active', lastError: null },
    });

    revalidatePath(INBOX_PATH);
    return { fetched: created, pullable: true };
  } catch (err) {
    const lastError = err instanceof ProviderNotConfiguredError ? err.message : 'Sync failed — check the channel credential';
    await prisma.inboxChannel.update({
      where: { id: channel.id },
      data: { status: 'error', lastError },
    });
    revalidatePath(INBOX_PATH);
    return { fetched: 0, pullable: true, error: lastError };
  }
}
