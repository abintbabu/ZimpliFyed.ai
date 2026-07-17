import { prisma } from '../src/lib/prisma';
import { enqueue } from '../src/lib/jobs/queue';

/**
 * Unified-inbox auto-pull sweep (INBOX_SPEC). Enqueues one `inbox.sync` job per active channel whose provider
 * can pull (Gmail today; IMAP later) so the worker fans out the actual fetches. Push-native channels (manual,
 * whatsapp) are skipped — they are fed by paste and the WhatsApp webhook respectively.
 *
 * Run on a short cron (e.g. every 5 min; see .github/workflows/*.yml). Same convention as the billing and
 * compliance sweeps: Postgres job table + polling worker, no external queue. Enqueue is idempotent on
 * (kind, idempotencyKey), so a channel already queued for this window is not double-scheduled.
 */

const PULLABLE_KINDS = ['gmail', 'imap'] as const;

async function sweepInboxSync() {
  const channels = await prisma.inboxChannel.findMany({
    where: { status: { not: 'paused' }, kind: { in: [...PULLABLE_KINDS] } },
    select: { id: true, tenantId: true, kind: true },
  });

  // One job per channel per minute bucket — a redelivered sweep inside the same minute dedupes.
  const bucket = Math.floor(Date.now() / 60_000);
  let queued = 0;
  for (const channel of channels) {
    await enqueue({
      tenantId: channel.tenantId,
      kind: 'inbox.sync',
      payload: { channelId: channel.id },
      idempotencyKey: `inbox.sync:${channel.id}:${bucket}`,
    });
    queued += 1;
    console.log(`[inbox-sync] tenant=${channel.tenantId} channel=${channel.id} kind=${channel.kind}`);
  }
  console.log(`[inbox-sync] channels=${channels.length} queued=${queued}`);
}

sweepInboxSync()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
