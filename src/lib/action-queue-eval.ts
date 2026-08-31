/**
 * Pure math for the ROADMAP §3 L2-promotion rule, per (tenant, kind). DB-free so it is unit-testable
 * (src/tests/action-queue/eval.test.ts) and shared by the reporting script (scripts/action-queue-eval.ts).
 *
 * Promotion (all must hold, over the rolling last 50 decided items, most recent first):
 *   - ≥30 decided instances
 *   - approve-without-edit rate ≥60%
 *   - Wilson 95% lower bound of that rate ≥50%
 * Demotion (either):
 *   - ≥3 rejections in the rolling last 7 days
 *   - rejection rate >20% over the last 10 decided
 *
 * NOTE: reporting only today — nothing consumes this to flip an autonomy level yet (that needs a
 * per-tenant autonomy field; out of scope, see ROADMAP §3).
 */

export const EVAL_WINDOW = 50;
export const PROMOTE_MIN_INSTANCES = 30;
export const PROMOTE_MIN_RATE = 0.6;
export const PROMOTE_MIN_WILSON_LB = 0.5;
export const DEMOTE_REJECTIONS_7D = 3;
export const DEMOTE_REJECTION_RATE_LAST_10 = 0.2;

/** One decided ActionQueueItem, newest first when passed in a list. */
export interface DecidedItem {
  status: 'approved' | 'rejected';
  editedOnApprove: boolean;
  decidedAt: Date;
}

/**
 * Wilson score interval, 95% lower bound (z = 1.96). Standard closed form:
 *   (p̂ + z²/2n − z·√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n)
 */
export function wilsonLowerBound(successes: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (center - margin) / denom);
}

export interface EvalResult {
  /** All-time decided count for the group. */
  totalDecided: number;
  /** Size of the rolling window actually available (≤ EVAL_WINDOW). */
  windowSize: number;
  approvedUnedited: number;
  /** approve-without-edit rate over the window; null when windowSize = 0. */
  rate: number | null;
  wilsonLB: number | null;
  meetsPromotion: boolean;
  rejectionsLast7d: number;
  /** Rejection rate over the last 10 decided; null when none decided. */
  rejectionRateLast10: number | null;
  meetsDemotion: boolean;
}

/**
 * @param decided decided items (approved/rejected only), MOST RECENT FIRST.
 * @param now clock injection for the 7-day rejection window.
 */
export function evaluateGroup(decided: DecidedItem[], totalDecided: number, now = new Date()): EvalResult {
  const window = decided.slice(0, EVAL_WINDOW);
  const n = window.length;
  const approvedUnedited = window.filter((d) => d.status === 'approved' && !d.editedOnApprove).length;
  const rate = n > 0 ? approvedUnedited / n : null;
  const lb = n > 0 ? wilsonLowerBound(approvedUnedited, n) : null;

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rejectionsLast7d = decided.filter((d) => d.status === 'rejected' && d.decidedAt >= sevenDaysAgo).length;
  const last10 = decided.slice(0, 10);
  const rejectionRateLast10 = last10.length > 0 ? last10.filter((d) => d.status === 'rejected').length / last10.length : null;

  return {
    totalDecided,
    windowSize: n,
    approvedUnedited,
    rate,
    wilsonLB: lb,
    meetsPromotion:
      n >= PROMOTE_MIN_INSTANCES && rate !== null && rate >= PROMOTE_MIN_RATE && lb !== null && lb >= PROMOTE_MIN_WILSON_LB,
    rejectionsLast7d,
    rejectionRateLast10,
    meetsDemotion:
      rejectionsLast7d >= DEMOTE_REJECTIONS_7D ||
      (rejectionRateLast10 !== null && rejectionRateLast10 > DEMOTE_REJECTION_RATE_LAST_10),
  };
}
