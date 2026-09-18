import assert from 'node:assert/strict';

/**
 * Integration tests for the platform layer against a REAL Postgres with the production schema: the action
 * queue, per-tenant feature flags, the DPDP consent gate on outbound WhatsApp, the durable job queue, the
 * DB-backed rate limiter, and inbox channel sync.
 *
 * These are the paths whose contracts live in the database — uniqueness constraints, atomic claims, window
 * rows — and so cannot be proven by a pure unit test. Like features.test.ts it refuses to run against
 * anything but a local loopback DB, so it can never touch the shared Supabase instance.
 *
 * One-time local setup (the schema needs pgvector, which Homebrew only builds for the newest Postgres —
 * build it against yours if `db push` reports `extension "vector" is not available`):
 *
 *   psql -h 127.0.0.1 -d postgres -c 'CREATE DATABASE zimplifyed_test'
 *   git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git && cd pgvector
 *   make && make install PG_CONFIG=$(brew --prefix postgresql@16)/bin/pg_config
 *   DATABASE_URL=postgresql://$USER@127.0.0.1:5432/zimplifyed_test npx prisma db push
 *
 * Then: DATABASE_URL=postgresql://$USER@127.0.0.1:5432/zimplifyed_test npm run test:integration:all
 *
 * §7-8 are regression cover for a timezone bug in the job queue's claim SQL: `runAfter`/`lockedAt` are
 * `timestamp WITHOUT time zone` holding UTC, so a bare `now()` compared against them silently skewed by the
 * server's UTC offset. Worth running these under a non-UTC server TimeZone — they pass from -08:00 to +14:00.
 */

async function main() {
// ── Safety guard: local loopback DBs only ─────────────────────────────────────
const url = process.env.DATABASE_URL ?? '';
const isLocal = /@(127\.0\.0\.1|localhost|::1)[:/]/.test(url) || url.includes('@localhost');
if (!url) {
  console.log('⊘ integration/platform: DATABASE_URL not set — skipping (needs a local test Postgres)');
  process.exit(0);
}
if (!isLocal) {
  console.error(`✗ integration/platform: refusing to run against non-local DB (${url.replace(/:[^:@/]+@/, ':****@')}).`);
  process.exit(1);
}

// Imported after the guard so the prisma singleton binds to the vetted local URL.
const { prisma } = await import('../../lib/prisma');
const { enqueueAction, actionAcceptanceStats, PROMOTION_MIN_DECISIONS } = await import('../../lib/action-queue');
const { isFeatureEnabled, listTenantFlags, FEATURE_FLAG_KEYS } = await import('../../lib/feature-flags');
const { sendWhatsAppTemplate, WhatsAppSendError } = await import('../../lib/whatsapp/send');
const { enqueue, claim, complete, fail, newWorkerId } = await import('../../lib/jobs/queue');
const { checkRateLimitDb } = await import('../../lib/rate-limit-db');
const { syncChannelCore } = await import('../../lib/inbox/sync');

const suffix = Date.now().toString(36);
let tenantAId = '';
let tenantBId = '';
const rateKeys: string[] = [];

async function cleanup() {
  for (const id of [tenantAId, tenantBId].filter(Boolean)) {
    await prisma.job.deleteMany({ where: { tenantId: id } });
    await prisma.inboxMessage.deleteMany({ where: { tenantId: id } });
    await prisma.inboxChannel.deleteMany({ where: { tenantId: id } });
    await prisma.consentRecord.deleteMany({ where: { tenantId: id } });
    await prisma.featureFlag.deleteMany({ where: { tenantId: id } });
    await prisma.actionQueueItem.deleteMany({ where: { tenantId: id } });
    await prisma.domainEvent.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.delete({ where: { id } }).catch(() => {});
  }
  if (rateKeys.length) await prisma.rateLimit.deleteMany({ where: { key: { in: rateKeys } } });
}

try {
  const tenantA = await prisma.tenant.create({ data: { slug: `ptest-a-${suffix}`, name: 'Platform A', plan: 'free', status: 'trial' } });
  const tenantB = await prisma.tenant.create({ data: { slug: `ptest-b-${suffix}`, name: 'Platform B', plan: 'free', status: 'trial' } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  // ── 1. Action queue: enqueue writes a row + a domain event ──────────────────
  {
    const id = await enqueueAction({
      tenantId: tenantAId,
      kind: 'send_followup',
      department: 'SELL',
      title: 'Follow up with Acme',
      summary: 'No reply in 5 days',
      payload: { subject: 'Checking in', body: 'Hi' },
      confidence: 0.72,
      dedupeKey: `followup:acme:${suffix}`,
    });

    const item = await prisma.actionQueueItem.findUniqueOrThrow({ where: { id } });
    assert.equal(item.tenantId, tenantAId);
    assert.equal(item.status, 'pending', 'a new action starts pending — nothing runs before a human decides');
    assert.equal(item.editedOnApprove, false, 'edit flag defaults false so acceptance stats start clean');
    assert.equal(item.confidence, 0.72);

    const events = await prisma.domainEvent.findMany({ where: { tenantId: tenantAId, type: 'action.enqueued', refId: id } });
    assert.equal(events.length, 1, 'exactly one action.enqueued event per enqueue');
    assert.deepEqual(events[0].payload, { kind: 'send_followup', department: 'SELL' });
  }

  // ── 2. Action queue: dedupeKey makes a cron retry a no-op ───────────────────
  {
    const key = `followup:dedupe:${suffix}`;
    const first = await enqueueAction({ tenantId: tenantAId, kind: 'send_followup', department: 'SELL', title: 'T', summary: 'S', dedupeKey: key });
    const second = await enqueueAction({ tenantId: tenantAId, kind: 'send_followup', department: 'SELL', title: 'T', summary: 'S', dedupeKey: key });
    assert.equal(second, first, 'a re-run with the same dedupeKey returns the existing pending item');
    assert.equal(await prisma.actionQueueItem.count({ where: { tenantId: tenantAId, dedupeKey: key } }), 1, 'no duplicate row');
    // The no-op must not emit a second event either, or consumers double-count.
    assert.equal(await prisma.domainEvent.count({ where: { tenantId: tenantAId, type: 'action.enqueued', refId: first } }), 1);

    // The same key in another tenant is a different action — dedupe must never span tenants.
    const other = await enqueueAction({ tenantId: tenantBId, kind: 'send_followup', department: 'SELL', title: 'T', summary: 'S', dedupeKey: key });
    assert.notEqual(other, first, 'dedupe is scoped per tenant');

    // Once decided, the key is free again: the next cycle's nudge is a genuinely new action.
    await prisma.actionQueueItem.update({ where: { id: first }, data: { status: 'approved', decidedAt: new Date() } });
    const third = await enqueueAction({ tenantId: tenantAId, kind: 'send_followup', department: 'SELL', title: 'T', summary: 'S', dedupeKey: key });
    assert.notEqual(third, first, 'dedupe only suppresses while the previous item is still pending');
  }

  // ── 3. Acceptance stats aggregate real rows and gate promotion ──────────────
  {
    const mk = (status: 'approved' | 'rejected', editedOnApprove: boolean, n: number) =>
      prisma.actionQueueItem.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          tenantId: tenantBId, kind: 'review_expense' as const, department: 'MONEY',
          title: `t${i}`, summary: 's', status, editedOnApprove, decidedAt: new Date(),
        })),
      });
    await mk('approved', false, 70); // approved as drafted
    await mk('approved', true, 10);  // approved but edited — approval, not an unedited one
    await mk('rejected', false, 20);

    const stats = await actionAcceptanceStats(tenantBId);
    const expense = stats.find((s) => s.kind === 'review_expense')!;
    assert.equal(expense.decided, 100, 'decided = approved + rejected');
    assert.equal(expense.approved, 80);
    assert.equal(expense.approvedUnedited, 70, 'edited approvals do not count toward the promotion numerator');
    assert.ok(Math.abs(expense.acceptanceRate! - 0.7) < 1e-9);
    assert.equal(expense.decided, PROMOTION_MIN_DECISIONS);
    assert.equal(expense.promotionEligible, true, '70% unedited over 100 decisions clears the §4 bar');

    // Pending and snoozed items are not yet a signal and must stay out of the denominator.
    await prisma.actionQueueItem.create({ data: { tenantId: tenantBId, kind: 'review_expense', department: 'MONEY', title: 'p', summary: 's', status: 'pending' } });
    await prisma.actionQueueItem.create({ data: { tenantId: tenantBId, kind: 'review_expense', department: 'MONEY', title: 'z', summary: 's', status: 'snoozed' } });
    const after = (await actionAcceptanceStats(tenantBId)).find((s) => s.kind === 'review_expense')!;
    assert.equal(after.decided, 100, 'pending/snoozed items are not decisions');

    // Tenant A's own decisions never leak into B's promotion math.
    const aStats = await actionAcceptanceStats(tenantAId);
    assert.ok(!aStats.some((s) => s.kind === 'review_expense'), 'tenant A has no review_expense decisions');
  }

  // ── 4. Feature flags: code default, per-tenant override, isolation ──────────
  {
    assert.equal(await isFeatureEnabled(tenantAId, 'gmail_reply'), false, 'no row → the code default (off)');

    await prisma.featureFlag.create({ data: { tenantId: tenantAId, key: 'gmail_reply', enabled: true } });
    assert.equal(await isFeatureEnabled(tenantAId, 'gmail_reply'), true, 'an override row turns the flag on');
    assert.equal(await isFeatureEnabled(tenantBId, 'gmail_reply'), false, 'the override is scoped to tenant A only');

    // An explicit `false` row must read as off, not fall through to the default — this is the kill switch
    // for a flag whose default later flips to true.
    await prisma.featureFlag.create({ data: { tenantId: tenantBId, key: 'inbox_sync', enabled: false } });
    assert.equal(await isFeatureEnabled(tenantBId, 'inbox_sync'), false);

    const flags = await listTenantFlags(tenantAId);
    assert.equal(flags.length, FEATURE_FLAG_KEYS.length, 'the console lists every registered flag');
    const gmail = flags.find((f) => f.key === 'gmail_reply')!;
    assert.equal(gmail.enabled, true);
    assert.equal(gmail.overridden, true, 'overridden flags are marked so the console can offer a reset');
    const untouched = flags.find((f) => f.key === 'copilot_v2')!;
    assert.equal(untouched.overridden, false);
    assert.equal(untouched.enabled, false, 'un-overridden flags report the code default');
    for (const f of flags) assert.ok(f.label && f.description, `${f.key} renders with a label`);
  }

  // ── 5. DPDP consent gate: WhatsApp cannot send without granted consent ──────
  {
    const to = `9199${suffix}`.slice(0, 12);
    const send = () => sendWhatsAppTemplate({ tenantId: tenantAId, to, template: 'quote_sent' });

    // No consent row at all.
    await assert.rejects(send, (e: unknown) => e instanceof WhatsAppSendError && e.code === 'consent_missing',
      'no consent record → consent_missing, and the gate is reached before any credential lookup');

    // A revoked record is not consent.
    await prisma.consentRecord.create({ data: { tenantId: tenantAId, channel: 'whatsapp', identifier: to, status: 'revoked', source: 'manual' } });
    await assert.rejects(send, (e: unknown) => e instanceof WhatsAppSendError && e.code === 'consent_missing',
      'revoked consent is refused, not treated as a record on file');

    // Consent granted for a DIFFERENT tenant must not unlock this one.
    await prisma.consentRecord.create({ data: { tenantId: tenantBId, channel: 'whatsapp', identifier: to, status: 'granted', source: 'whatsapp_opt_in' } });
    await assert.rejects(send, (e: unknown) => e instanceof WhatsAppSendError && e.code === 'consent_missing',
      "another tenant's consent does not carry over");

    // Consent granted on the EMAIL channel must not unlock WhatsApp.
    await prisma.consentRecord.create({ data: { tenantId: tenantAId, channel: 'email', identifier: to, status: 'granted', source: 'signup_form' } });
    await assert.rejects(send, (e: unknown) => e instanceof WhatsAppSendError && e.code === 'consent_missing',
      'consent is per-channel');

    // With consent granted, the gate opens and the next failure is the missing credential —
    // proving the send got past consent without this test ever hitting Meta's API.
    await prisma.consentRecord.update({
      where: { tenantId_channel_identifier: { tenantId: tenantAId, channel: 'whatsapp', identifier: to } },
      data: { status: 'granted' },
    });
    await assert.rejects(send, (e: unknown) => e instanceof WhatsAppSendError && e.code === 'no_credential',
      'granted consent passes the gate; the send then stops at the absent credential');
  }

  // ── 6. Job queue: idempotent enqueue, atomic claim, complete ────────────────
  {
    const key = `job-idem-${suffix}`;
    const first = await enqueue({ tenantId: tenantAId, kind: 'noop', payload: { note: 'one' }, idempotencyKey: key });
    assert.equal(first.deduped, false);
    const replay = await enqueue({ tenantId: tenantAId, kind: 'noop', payload: { note: 'two' }, idempotencyKey: key });
    assert.equal(replay.deduped, true, 'a webhook replay does not create a second job');
    assert.equal(replay.id, first.id);
    assert.equal(await prisma.job.count({ where: { id: first.id } }), 1);
    // The dedupe keeps the ORIGINAL payload — a replay must not rewrite the work in flight.
    assert.deepEqual((await prisma.job.findUniqueOrThrow({ where: { id: first.id } })).payload, { note: 'one' });

    // A job scheduled for the future is not claimable yet.
    await enqueue({ tenantId: tenantAId, kind: 'noop', payload: {}, idempotencyKey: `future-${suffix}`, runAfter: new Date(Date.now() + 3_600_000) });

    const worker = newWorkerId();
    const claimed = await claim(worker);
    assert.ok(claimed, 'the due job is claimable');
    assert.equal(claimed!.id, first.id, 'the future-dated job was not picked up');
    assert.equal(claimed!.attempts, 1, 'claiming increments the attempt counter');
    assert.equal(claimed!.tenantId, tenantAId, 'the claim carries its tenant so the handler stays scoped');

    // A second worker cannot take the same job while the lease holds.
    const row = await prisma.job.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(row.status, 'active');
    assert.equal(row.lockedBy, worker);
    const second = await claim(newWorkerId());
    assert.ok(second === null || second.id !== first.id, 'a leased job is not handed to a second worker');

    await complete(claimed!);
    const done = await prisma.job.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(done.status, 'completed');
    assert.ok(done.completedAt);
    assert.equal(done.lockedBy, null, 'the lease is released on completion');
    assert.equal(await claim(newWorkerId()), null, 'a completed job is never re-claimed');
  }

  // ── 7. Job queue: failure retries with backoff, then parks as failed ────────
  {
    const { id } = await enqueue({ tenantId: tenantAId, kind: 'noop', payload: {}, idempotencyKey: `job-fail-${suffix}`, maxAttempts: 2 });
    const worker = newWorkerId();

    const a = await claim(worker);
    assert.equal(a!.id, id);
    const before = Date.now();
    await fail(a!, new Error('upstream 503'));
    const retry = await prisma.job.findUniqueOrThrow({ where: { id } });
    assert.equal(retry.status, 'queued', 'attempt 1 of 2 is rescheduled, not parked');
    assert.match(retry.lastError!, /Error: upstream 503/, 'the error is recorded for triage');
    assert.ok(retry.runAfter.getTime() >= before + 10_000 - 1_000, 'rescheduled ~10s out (first backoff step)');
    assert.equal(retry.lockedBy, null, 'the lease is released so another worker can retry');

    // Not claimable until the backoff elapses — this is what stops a hot retry loop.
    assert.equal(await claim(newWorkerId()), null, 'the backing-off job is invisible to claim()');

    // Fast-forward past the backoff, exhaust the final attempt.
    await prisma.job.update({ where: { id }, data: { runAfter: new Date(Date.now() - 1_000) } });
    const b = await claim(worker);
    assert.equal(b!.id, id);
    assert.equal(b!.attempts, 2, 'attempts accumulate across claims');
    await fail(b!, new Error('upstream 503 again'));
    const parked = await prisma.job.findUniqueOrThrow({ where: { id } });
    assert.equal(parked.status, 'failed', 'maxAttempts reached → parked as failed, not retried forever');
    assert.equal(await claim(newWorkerId()), null, 'a parked job is never claimed again');

    // A very long error message is truncated rather than blowing up the column.
    const { id: id2 } = await enqueue({ tenantId: tenantAId, kind: 'noop', payload: {}, idempotencyKey: `job-longerr-${suffix}`, maxAttempts: 1 });
    const c = await claim(newWorkerId());
    await fail(c!, new Error('x'.repeat(5000)));
    const trunc = await prisma.job.findUniqueOrThrow({ where: { id: id2 } });
    assert.ok(trunc.lastError!.length <= 2000, 'lastError is capped at 2000 chars');
  }

  // ── 8. Job queue: an expired lease is reclaimable (worker crash recovery) ───
  {
    const { id } = await enqueue({ tenantId: tenantAId, kind: 'noop', payload: {}, idempotencyKey: `job-lease-${suffix}` });
    const dead = await claim(newWorkerId());
    assert.equal(dead!.id, id);
    // Simulate the worker dying mid-job: the row stays `active` with a stale lock.
    await prisma.job.update({ where: { id }, data: { lockedAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const rescuer = newWorkerId();
    const reclaimed = await claim(rescuer);
    assert.equal(reclaimed!.id, id, 'a job whose 5-minute lease expired is picked up by another worker');
    assert.equal(reclaimed!.attempts, 2, 'the reclaim counts as another attempt, so a poison job still parks');
    await complete(reclaimed!);
  }

  // ── 9. DB-backed rate limiter: window, denial, retry-after, key isolation ───
  {
    const key = `rl-${suffix}`;
    const other = `rl-other-${suffix}`;
    rateKeys.push(key, other);

    assert.deepEqual(await checkRateLimitDb(key, 2, 60_000), { allowed: true, retryAfterSec: 0 });
    assert.deepEqual(await checkRateLimitDb(key, 2, 60_000), { allowed: true, retryAfterSec: 0 });
    const denied = await checkRateLimitDb(key, 2, 60_000);
    assert.equal(denied.allowed, false, 'the 3rd call in the window is denied');
    assert.ok(denied.retryAfterSec > 0 && denied.retryAfterSec <= 60, `retryAfterSec is a usable Retry-After (got ${denied.retryAfterSec})`);

    assert.equal((await checkRateLimitDb(other, 2, 60_000)).allowed, true, 'a different key has its own window');

    // Expiring the window row lets the caller through again — the limiter must not latch on.
    await prisma.rateLimit.update({ where: { key }, data: { resetAt: new Date(Date.now() - 1_000) } });
    assert.equal((await checkRateLimitDb(key, 2, 60_000)).allowed, true, 'an elapsed window resets the count');
    const row = await prisma.rateLimit.findUniqueOrThrow({ where: { key } });
    assert.equal(row.count, 1, 'the fresh window starts the count at 1, not carrying the old total');
  }

  // ── 10. Inbox sync: non-pullable and unconfigured channels ──────────────────
  {
    // A manual channel is fed externally; syncing it is a no-op, never an error.
    const manual = await prisma.inboxChannel.create({ data: { tenantId: tenantAId, kind: 'manual', account: '', name: 'Pasted', createdByUserId: 'test-user' } });
    assert.deepEqual(await syncChannelCore(manual.id, tenantAId), { fetched: 0, pullable: false });

    // An unwired connector records the error on the channel instead of throwing into the caller/worker.
    const imap = await prisma.inboxChannel.create({ data: { tenantId: tenantAId, kind: 'imap', account: 'ops@acme.co.in', name: 'IMAP', createdByUserId: 'test-user' } });
    const res = await syncChannelCore(imap.id, tenantAId);
    assert.equal(res.pullable, true);
    assert.ok(res.error, 'the provider error is returned, not thrown');
    const errored = await prisma.inboxChannel.findUniqueOrThrow({ where: { id: imap.id } });
    assert.equal(errored.status, 'error', 'the channel is flagged so the UI can prompt a reconnect');
    assert.match(errored.lastError!, /not connected yet/);

    // Tenant scoping: another tenant cannot sync this channel by guessing its id.
    await assert.rejects(() => syncChannelCore(imap.id, tenantBId), /Unknown channel/, 'channel lookup is tenant-scoped');
  }

  // ── 11. Inbox message ingestion is idempotent per (channel, externalMessageId)
  {
    const channel = await prisma.inboxChannel.create({ data: { tenantId: tenantAId, kind: 'gmail', account: 'ops@acme.co.in', name: 'Gmail', createdByUserId: 'test-user' } });
    const upsert = () =>
      prisma.inboxMessage.upsert({
        where: { channelId_externalMessageId: { channelId: channel.id, externalMessageId: 'gmail-msg-1' } },
        create: { tenantId: tenantAId, channelId: channel.id, externalMessageId: 'gmail-msg-1', body: 'Need 500 towels', subject: 'Enquiry', receivedAt: new Date() },
        update: {},
        select: { id: true },
      });
    const a = await upsert();
    const b = await upsert();
    assert.equal(b.id, a.id, 'a re-delivered Gmail message maps to the same row (the sync dedupe guard)');
    assert.equal(await prisma.inboxMessage.count({ where: { channelId: channel.id } }), 1);

    // The same provider id on a DIFFERENT channel is a distinct message.
    const channel2 = await prisma.inboxChannel.create({ data: { tenantId: tenantAId, kind: 'gmail', account: 'sales@acme.co.in', name: 'Gmail 2', createdByUserId: 'test-user' } });
    const c = await prisma.inboxMessage.create({ data: { tenantId: tenantAId, channelId: channel2.id, externalMessageId: 'gmail-msg-1', body: 'Other', receivedAt: new Date() } });
    assert.notEqual(c.id, a.id, 'the uniqueness guard is per channel, not global');
  }

  console.log('✓ integration/platform: 11 scenarios pass — action queue dedupe & acceptance, feature flags, DPDP consent gate, job queue lifecycle, rate limiter, inbox sync & dedupe');
} finally {
  await cleanup();
  await prisma.$disconnect();
}
}

main().catch((err) => { console.error(err); process.exit(1); });
