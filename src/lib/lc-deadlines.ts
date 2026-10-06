// Letter-of-credit deadline logic (M3). Pure — no DB, no clock — so the nightly sweep, the founder brief
// and the panel all derive the same alerts from the same function.
//
// The two dates that sink LCs: the latest date of shipment (ship late and every document is discrepant)
// and the expiry (documents must be presented to the bank before it). Both stop mattering once the LC has
// moved past the stage they guard.

export type LcStatusValue = 'draft' | 'advised' | 'amended' | 'documents_presented' | 'accepted' | 'paid' | 'expired' | 'cancelled';

/** Statuses in which the LC can still be lost to a missed date. */
const OPEN: LcStatusValue[] = ['draft', 'advised', 'amended'];

export const LC_ALERT_WINDOW_DAYS = 14;
export const LC_URGENT_DAYS = 3;

export type LcDeadlineKind = 'shipment' | 'expiry';

export type LcDeadlineAlert = {
  kind: LcDeadlineKind;
  date: Date;
  /** Whole days from `now` to the date; negative once passed. */
  daysLeft: number;
  overdue: boolean;
  severity: 'urgent' | 'attention';
  /** Escalation band — changes as the deadline closes so the sweep can re-alert once per band. */
  band: 'overdue' | 'd3' | 'd14';
};

const DAY = 86_400_000;

function daysUntil(date: Date, now: Date): number {
  // Compare calendar dates (UTC) so a deadline "today" is 0 days left, not -0.4.
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / DAY);
}

export type LcDeadlineInput = {
  status: LcStatusValue;
  expiryDate: Date | null;
  latestShipmentDate: Date | null;
};

/**
 * Alerts due now. `orderShipped` suppresses the shipment-date alert once goods are on the water — the
 * deadline has been met (or missed irrevocably) and nagging about it helps no one.
 */
export function lcDeadlineAlerts(lc: LcDeadlineInput, orderShipped: boolean, now: Date, windowDays = LC_ALERT_WINDOW_DAYS): LcDeadlineAlert[] {
  if (!OPEN.includes(lc.status)) return [];

  const out: LcDeadlineAlert[] = [];
  const consider = (kind: LcDeadlineKind, date: Date | null) => {
    if (!date) return;
    const daysLeft = daysUntil(date, now);
    if (daysLeft > windowDays) return;
    const overdue = daysLeft < 0;
    const urgent = overdue || daysLeft <= LC_URGENT_DAYS;
    out.push({ kind, date, daysLeft, overdue, severity: urgent ? 'urgent' : 'attention', band: overdue ? 'overdue' : urgent ? 'd3' : 'd14' });
  };

  if (!orderShipped) consider('shipment', lc.latestShipmentDate);
  consider('expiry', lc.expiryDate);
  return out;
}

export type LcTerms = {
  amount: number | null;
  currency: string | null;
  expiryDate: Date | null;
  latestShipmentDate: Date | null;
};

/** Problems with the terms as entered, optionally against the order they back. Never throws. */
export function lcTermProblems(lc: LcTerms, order?: { total: number | null; currency: string | null }): string[] {
  const problems: string[] = [];
  if (lc.amount != null && !(lc.amount > 0)) problems.push('LC amount must be above 0.');
  if (lc.amount != null && !lc.currency) problems.push('LC amount needs a currency.');
  if (lc.expiryDate && lc.latestShipmentDate && lc.expiryDate < lc.latestShipmentDate) {
    problems.push('LC expiry is before the latest shipment date — documents could never be presented in time.');
  }
  if (lc.amount != null && lc.currency && order?.total != null && order.currency) {
    if (lc.currency.toUpperCase() !== order.currency.toUpperCase()) {
      problems.push(`LC is in ${lc.currency.toUpperCase()} but the order is in ${order.currency.toUpperCase()}.`);
    } else if (lc.amount + 0.005 < order.total) {
      problems.push(`LC amount (${lc.amount}) is below the order value (${order.total}) — the balance would be unsecured.`);
    }
  }
  return problems;
}
