import assert from 'node:assert/strict';
import {
  computeAcceptanceStats,
  PROMOTION_MIN_DECISIONS,
  PROMOTION_MIN_RATE,
  type AcceptanceGroupRow,
} from '../../lib/action-queue';

/**
 * L-promotion currency (CPO_PRODUCT_PLAN §4). Pure, no DB: `npm run test:action-queue`.
 * Verifies the approve-without-edit reducer: rate = unedited-approved / decided, rejections count in the
 * denominator, and promotion eligibility needs BOTH the volume floor and the rate floor.
 */

const stat = (rows: AcceptanceGroupRow[], kind = 'send_followup') =>
  computeAcceptanceStats(rows).find((s) => s.kind === kind)!;

// ── Empty input yields no stats ──────────────────────────────────────────────
assert.deepEqual(computeAcceptanceStats([]), []);

// ── Rate is unedited-approved / decided; edited approvals do NOT count in the numerator ───
{
  const s = stat([
    { kind: 'send_followup', status: 'approved', editedOnApprove: false, count: 6 },
    { kind: 'send_followup', status: 'approved', editedOnApprove: true, count: 2 },
    { kind: 'send_followup', status: 'rejected', editedOnApprove: false, count: 2 },
  ]);
  assert.equal(s.decided, 10);
  assert.equal(s.approved, 8);
  assert.equal(s.approvedUnedited, 6);
  assert.equal(s.acceptanceRate, 0.6);
}

// ── No decisions → null rate, not a divide-by-zero ───────────────────────────
{
  // A rejected-only history still has a defined (zero) rate; a kind with no rows simply isn't returned.
  const s = stat([{ kind: 'send_followup', status: 'rejected', editedOnApprove: false, count: 3 }]);
  assert.equal(s.acceptanceRate, 0);
  assert.equal(s.promotionEligible, false);
}

// ── Promotion needs BOTH floors: enough decisions AND a high-enough rate ──────
{
  // Rate clears the bar but too few decisions → not eligible.
  const few = stat([{ kind: 'send_followup', status: 'approved', editedOnApprove: false, count: 50 }]);
  assert.equal(few.acceptanceRate, 1);
  assert.equal(few.decided < PROMOTION_MIN_DECISIONS, true);
  assert.equal(few.promotionEligible, false);

  // Enough decisions and exactly at the rate floor → eligible.
  const uneditedApproved = Math.ceil(PROMOTION_MIN_DECISIONS * PROMOTION_MIN_RATE);
  const rejected = PROMOTION_MIN_DECISIONS - uneditedApproved;
  const at = stat([
    { kind: 'send_followup', status: 'approved', editedOnApprove: false, count: uneditedApproved },
    { kind: 'send_followup', status: 'rejected', editedOnApprove: false, count: rejected },
  ]);
  assert.equal(at.decided, PROMOTION_MIN_DECISIONS);
  assert.ok(at.acceptanceRate! >= PROMOTION_MIN_RATE);
  assert.equal(at.promotionEligible, true);

  // Enough decisions but below the rate floor (edits drag it down) → not eligible.
  const below = stat([
    { kind: 'send_followup', status: 'approved', editedOnApprove: false, count: 50 },
    { kind: 'send_followup', status: 'approved', editedOnApprove: true, count: 60 },
  ]);
  assert.equal(below.decided, 110);
  assert.ok(below.acceptanceRate! < PROMOTION_MIN_RATE);
  assert.equal(below.promotionEligible, false);
}

// ── Multiple kinds are aggregated independently ──────────────────────────────
{
  const all = computeAcceptanceStats([
    { kind: 'send_followup', status: 'approved', editedOnApprove: false, count: 3 },
    { kind: 'review_expense', status: 'approved', editedOnApprove: false, count: 1 },
    { kind: 'review_expense', status: 'rejected', editedOnApprove: false, count: 1 },
  ]);
  assert.equal(all.length, 2);
  assert.equal(all.find((s) => s.kind === 'send_followup')!.acceptanceRate, 1);
  assert.equal(all.find((s) => s.kind === 'review_expense')!.acceptanceRate, 0.5);
}

console.log('✓ action-queue acceptance: rate, denominator, dual promotion floors, multi-kind all pass');
