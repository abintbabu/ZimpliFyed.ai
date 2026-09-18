import assert from 'node:assert/strict';
import { nextBackoffSeconds, newWorkerId } from '../../lib/jobs/queue';
import { getHandler, registeredKinds, registerHandler } from '../../lib/jobs/handlers';

/**
 * Job-queue pure logic: the retry backoff schedule and worker identity. No DB — the claim/complete/fail
 * round trip is covered in the integration suite. Run: `npm run test:jobs`.
 */

async function main() {
// ── nextBackoffSeconds: 10s, 20s, 40s … capped at 1h ──────────────────────────
assert.equal(nextBackoffSeconds(1), 10, 'first retry waits 10s');
assert.equal(nextBackoffSeconds(2), 20);
assert.equal(nextBackoffSeconds(3), 40);
assert.equal(nextBackoffSeconds(4), 80);
assert.equal(nextBackoffSeconds(5), 160);

// Strictly increasing until the cap, then flat — never zero (which would hot-loop a failing job)
// and never above the cap (which would park a retry beyond any reasonable recovery window).
for (let n = 1; n <= 20; n++) {
  const b = nextBackoffSeconds(n);
  assert.ok(b > 0, `attempt ${n} backoff is positive`);
  assert.ok(b <= 3600, `attempt ${n} backoff never exceeds the 1h cap (got ${b})`);
  if (n > 1) assert.ok(b >= nextBackoffSeconds(n - 1), `backoff is monotonic at attempt ${n}`);
}
assert.equal(nextBackoffSeconds(10), 3600, 'saturates at the 1h cap');
assert.equal(nextBackoffSeconds(100), 3600, 'stays at the cap rather than overflowing to Infinity');
assert.ok(Number.isFinite(nextBackoffSeconds(2000)), '2**2000 overflows to Infinity — the cap must absorb it');

// ── newWorkerId ───────────────────────────────────────────────────────────────
{
  const a = newWorkerId();
  const b = newWorkerId();
  assert.notEqual(a, b, 'two workers on one host never collide (the lease is keyed on this)');
  assert.match(a, /^.+-[0-9a-f]{8}$/, 'shaped as <host>-<8 hex>');

  const saved = process.env.HOSTNAME;
  delete process.env.HOSTNAME;
  assert.match(newWorkerId(), /^worker-/, 'falls back to "worker" with no HOSTNAME');
  process.env.HOSTNAME = 'box-1';
  assert.match(newWorkerId(), /^box-1-/, 'uses HOSTNAME when set');
  if (saved === undefined) delete process.env.HOSTNAME;
  else process.env.HOSTNAME = saved;
}

// ── handler registry ──────────────────────────────────────────────────────────
{
  const kinds = registeredKinds();
  assert.ok(kinds.length > 0, 'at least one handler is registered');
  assert.equal(new Set(kinds).size, kinds.length, 'no duplicate registrations');
  for (const kind of kinds) {
    assert.equal(typeof getHandler(kind), 'function', `${kind} resolves to a callable handler`);
  }

  // The kinds the product actually enqueues today must all be routable, or the worker would burn
  // every attempt on "No handler registered" and park the job as failed.
  for (const kind of ['noop', 'expense.extract', 'inbox.ingest', 'inbox.sync'] as const) {
    assert.ok(getHandler(kind), `${kind} is enqueued in production and must have a handler`);
  }

  // `pipeline.extract` is declared in JobPayloads but deliberately unregistered until Sprint 4 lands.
  // That is safe only because the worker treats a missing handler as an ordinary job failure rather
  // than crashing the loop; this asserts the gap stays a known one instead of drifting silently.
  assert.equal(getHandler('pipeline.extract'), undefined, 'pipeline.extract is not wired yet (Sprint 4)');

  // registerHandler makes a kind routable at runtime (used by tests and future sprints).
  let ran = false;
  registerHandler('pipeline.extract', async () => { ran = true; });
  await getHandler('pipeline.extract')!({ documentId: 'd', docType: 'invoice' }, { tenantId: 't', jobId: 'j', attempts: 1 });
  assert.ok(ran, 'registerHandler wires a kind the worker can then route');
}

console.log(`✓ jobs: backoff schedule (cap + monotonicity + overflow), worker identity, handler registry`);
}

main().catch((err) => { console.error(err); process.exit(1); });
