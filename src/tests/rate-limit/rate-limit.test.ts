import assert from 'node:assert/strict';
import { checkRateLimit } from '../../lib/rate-limit';

/**
 * In-memory fixed-window rate limiter. Pure and clock-driven, so the window rollover is tested by
 * faking Date.now rather than sleeping. Run: `npm run test:rate-limit`.
 * The DB-backed limiter (rate-limit-db.ts) is covered in the integration suite.
 */

const realNow = Date.now;
let now = 1_000_000;
Date.now = () => now;

try {
  const key = () => `k-${Math.random()}`;

  // ── Allows exactly `limit` calls inside one window ──────────────────────────
  {
    const k = key();
    for (let i = 1; i <= 3; i++) assert.equal(checkRateLimit(k, 3, 60_000), true, `call ${i} of 3 allowed`);
    assert.equal(checkRateLimit(k, 3, 60_000), false, 'the 4th call in the window is denied');
    assert.equal(checkRateLimit(k, 3, 60_000), false, 'stays denied for the rest of the window');
  }

  // ── Keys are independent ────────────────────────────────────────────────────
  {
    const a = key();
    const b = key();
    assert.equal(checkRateLimit(a, 1, 60_000), true);
    assert.equal(checkRateLimit(a, 1, 60_000), false, 'a is exhausted');
    assert.equal(checkRateLimit(b, 1, 60_000), true, 'b has its own bucket (one IP cannot lock out another)');
  }

  // ── Window rollover resets the count ────────────────────────────────────────
  {
    const k = key();
    assert.equal(checkRateLimit(k, 2, 10_000), true);
    assert.equal(checkRateLimit(k, 2, 10_000), true);
    assert.equal(checkRateLimit(k, 2, 10_000), false, 'exhausted within the window');

    now += 9_999;
    assert.equal(checkRateLimit(k, 2, 10_000), false, 'still inside the window just before it expires');

    now += 2; // now past resetAt
    assert.equal(checkRateLimit(k, 2, 10_000), true, 'a fresh window opens and the count resets');
    assert.equal(checkRateLimit(k, 2, 10_000), true, 'the new window grants the full allowance again');
    assert.equal(checkRateLimit(k, 2, 10_000), false);
  }

  // ── A limit of 0 denies everything after the first bucket creation ──────────
  // The first call seeds the bucket and returns true by construction; document that, so a caller
  // never reaches for limit:0 expecting a hard block.
  {
    const k = key();
    assert.equal(checkRateLimit(k, 0, 60_000), true, 'first call seeds the bucket (limit 0 is not a hard block)');
    assert.equal(checkRateLimit(k, 0, 60_000), false, 'every subsequent call is denied');
  }

  // ── A long-idle key does not leak a stale denial ────────────────────────────
  {
    const k = key();
    assert.equal(checkRateLimit(k, 1, 1_000), true);
    assert.equal(checkRateLimit(k, 1, 1_000), false);
    now += 86_400_000; // a day later
    assert.equal(checkRateLimit(k, 1, 1_000), true, 'an expired bucket is replaced, not carried forward');
  }

  console.log('✓ rate-limit: window allowance, key isolation, rollover boundary, idle-bucket reset');
} finally {
  Date.now = realNow;
}
