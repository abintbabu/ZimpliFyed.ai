import assert from 'node:assert/strict';
import {
  wilsonLowerBound,
  evaluateGroup,
  EVAL_WINDOW,
  PROMOTE_MIN_INSTANCES,
  type DecidedItem,
} from '../../lib/action-queue-eval';

/**
 * ROADMAP §3 promotion/demotion math (pure, no DB): `npm run test:action-queue-eval`.
 */

const NOW = new Date('2026-08-31T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);
const approved = (d = 1, edited = false): DecidedItem => ({ status: 'approved', editedOnApprove: edited, decidedAt: daysAgo(d) });
const rejected = (d = 1): DecidedItem => ({ status: 'rejected', editedOnApprove: false, decidedAt: daysAgo(d) });

// ── Wilson lower bound ───────────────────────────────────────────────────────
assert.equal(wilsonLowerBound(0, 0), 0); // no data → 0, no NaN
assert.equal(wilsonLowerBound(0, 10), 0); // 0 successes → clamped at 0
{
  // Known value: 30/40 = 75% → 95% Wilson LB ≈ 0.5970 (standard reference result).
  const lb = wilsonLowerBound(30, 40);
  assert.ok(Math.abs(lb - 0.597) < 0.005, `expected ≈0.597, got ${lb}`);
  // LB is strictly below the point estimate and grows with n at the same rate.
  assert.ok(lb < 0.75);
  assert.ok(wilsonLowerBound(300, 400) > lb);
}
// n=1 success: LB is small but positive-ish sanity
assert.ok(wilsonLowerBound(1, 1) > 0 && wilsonLowerBound(1, 1) < 1);

// ── Rate over rolling window, most recent first ──────────────────────────────
{
  // 60 decided items; only the first EVAL_WINDOW (50) count. Front-load unedited approvals.
  const items = [...Array.from({ length: 50 }, () => approved(2)), ...Array.from({ length: 10 }, () => rejected(3))];
  const r = evaluateGroup(items, 60, NOW);
  assert.equal(r.windowSize, EVAL_WINDOW);
  assert.equal(r.totalDecided, 60);
  assert.equal(r.rate, 1); // the 10 older rejections fall outside the window
}

// ── Edited approvals count in denominator, not numerator ─────────────────────
{
  const r = evaluateGroup([approved(1, false), approved(1, true), rejected(30), rejected(30)], 4, NOW);
  assert.equal(r.approvedUnedited, 1);
  assert.equal(r.rate, 0.25);
}

// ── Promotion needs volume + rate + Wilson LB ────────────────────────────────
{
  // 29 unedited approvals, 100% rate — below the 30-instance floor.
  const r = evaluateGroup(Array.from({ length: PROMOTE_MIN_INSTANCES - 1 }, () => approved(2)), 29, NOW);
  assert.equal(r.meetsPromotion, false);

  // 30/30 unedited → rate 1.0, Wilson LB(30,30) ≈ 0.886 → promotes.
  const ok = evaluateGroup(Array.from({ length: 30 }, () => approved(2)), 30, NOW);
  assert.equal(ok.meetsPromotion, true);

  // Exactly 60% over 30 (18/30): rate meets 0.6 but Wilson LB ≈ 0.423 < 0.5 → NOT eligible.
  const marginal = evaluateGroup(
    [...Array.from({ length: 18 }, () => approved(10)), ...Array.from({ length: 12 }, () => rejected(10))],
    30,
    NOW,
  );
  assert.equal(marginal.rate, 0.6);
  assert.ok(marginal.wilsonLB! < 0.5);
  assert.equal(marginal.meetsPromotion, false);

  // 35/50 = 70%: Wilson LB(35,50) ≈ 0.562 ≥ 0.5 → eligible.
  const strong = evaluateGroup(
    [...Array.from({ length: 35 }, () => approved(10)), ...Array.from({ length: 15 }, () => approved(10, true))],
    50,
    NOW,
  );
  assert.equal(strong.rate, 0.7);
  assert.equal(strong.meetsPromotion, true);
}

// ── Demotion: 3 rejections in 7 days OR >20% rejection over last 10 ──────────
{
  // 2 recent rejections + 8 approvals = 20% over last 10 (not >20%), <3 in 7d → hold.
  const hold = evaluateGroup([rejected(1), rejected(2), ...Array.from({ length: 8 }, () => approved(3))], 10, NOW);
  assert.equal(hold.rejectionsLast7d, 2);
  assert.equal(hold.rejectionRateLast10, 0.2);
  assert.equal(hold.meetsDemotion, false);

  // 3 rejections inside 7 days → demote regardless of overall rate.
  const d1 = evaluateGroup([rejected(1), rejected(3), rejected(6), ...Array.from({ length: 47 }, () => approved(10))], 50, NOW);
  assert.equal(d1.rejectionsLast7d, 3);
  assert.equal(d1.meetsDemotion, true);

  // Old rejections (8+ days) don't trip the 7-day rule, but 3/10 = 30% > 20% trips the rate rule.
  const d2 = evaluateGroup([rejected(8), rejected(9), rejected(10), ...Array.from({ length: 7 }, () => approved(11))], 10, NOW);
  assert.equal(d2.rejectionsLast7d, 0);
  assert.equal(d2.rejectionRateLast10, 0.3);
  assert.equal(d2.meetsDemotion, true);
}

// ── Empty history ────────────────────────────────────────────────────────────
{
  const r = evaluateGroup([], 0, NOW);
  assert.equal(r.rate, null);
  assert.equal(r.wilsonLB, null);
  assert.equal(r.meetsPromotion, false);
  assert.equal(r.meetsDemotion, false);
}

console.log('✓ action-queue eval: wilson bound + promotion/demotion thresholds all pass');
