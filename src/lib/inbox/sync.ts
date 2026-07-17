import 'server-only';
import { prisma } from '@/lib/prisma';
import { enqueue } from '@/lib/jobs/queue';
import { getInboxProvider, ProviderNotConfiguredError } from './provider';

/**
 * Session-free channel sync core (INBOX_SPEC). Pulls new messages from a channel's provider, upserts them
 * (dedupe on channelId+externalMessageId), queues classification, and advances the sync watermark — recording
 * a provider error on the channel rather than throwing. Tenant-scoped by the (id, tenantId) lookup.
 *
 * Shared by the `syncChannel` server action (manual "Sync now" button) and the `inbox.sync` background job
 * (periodic auto-pull via scripts/inbox-sync-sweep.ts), so the pull logic lives in exactly one place.
 */
export type SyncResult = { fetched: number; pullable: boolean; error?: string };

export async function syncChannelCore(channelId: string, tenantId: string): Promise<SyncResult> {
  const channel = await prisma.inboxChannel.findFirst({
    where: { id: channelId, tenantId },
    select: { id: true, kind: true, account: true, lastSyncCursor: true },
  });
  if (!channel) throw new Error('Unknown channel');

  const provider = getInboxProvider(channel.kind);
  if (!provider.canPull) return { fetched: 0, pullable: false };

  try {
    const { messages, cursor } = await provider.fetch({
      tenantId,
      account: channel.account,
      cursor: channel.lastSyncCursor,
    });

    let created = 0;
    for (const m of messages) {
      const row = await prisma.inboxMessage.upsert({
        where: { channelId_externalMessageId: { channelId: channel.id, externalMessageId: m.externalMessageId } },
        create: {
          tenantId,
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
        await enqueue({ tenantId, kind: 'inbox.ingest', payload: { messageId: row.id } });
      }
    }

    await prisma.inboxChannel.update({ // tenant-safe: channelId verified tenant-owned via findFirst above
      where: { id: channel.id },
      data: { lastSyncCursor: cursor, lastSyncedAt: new Date(), status: 'active', lastError: null },
    });

    return { fetched: created, pullable: true };
  } catch (err) {
    const lastError = err instanceof ProviderNotConfiguredError ? err.message : 'Sync failed — check the channel credential';
    await prisma.inboxChannel.update({ // tenant-safe: channelId verified tenant-owned via findFirst above
      where: { id: channel.id },
      data: { status: 'error', lastError },
    });
    return { fetched: 0, pullable: true, error: lastError };
  }
}
