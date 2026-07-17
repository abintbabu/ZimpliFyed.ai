/**
 * GST filing-prep aggregation (CEO decision 2026-07-12: prepare + classify + route to the firm's CA/GSP;
 * Zimplifyed never files returns itself). Pure functions over already-extracted data — no DB, no AI — so the
 * numbers are deterministic and unit-testable, and the action layer only supplies the period's rows.
 *
 * An exporter's outward supplies are almost entirely zero-rated (exports, with/without LUT), so the pack's
 * substance is the INPUT side: ITC-eligible expenses grouped by GST head, which the CA reconciles against
 * GSTR-2B. Outward invoices are summarised by currency as zero-rated turnover for context. This is a working
 * summary for the CA — not a filed return.
 */

export type PrepExpense = {
  id: string;
  status: string;
  gstHead: string | null;
  itcEligible: boolean | null;
  amount: number | null;
  currency: string | null;
  vendorName: string | null;
  expenseDate: Date | null;
};

export type PrepInvoice = {
  id: string;
  currency: string;
  total: number;
  isCreditOrDebitNote: boolean;
};

export type GstHeadSummary = { gstHead: string; count: number; total: number };
export type CurrencyTotal = { currency: string; count: number; total: number };

export type GstPrepPack = {
  period: string; // "YYYY-MM"
  input: {
    /** ITC-eligible spend grouped by GST head, highest total first. */
    byHead: GstHeadSummary[];
    /** Total ITC-eligible input spend (base amounts; the CA computes the tax component from the invoices). */
    itcEligibleTotal: number;
    itcEligibleCount: number;
    /** Expenses excluded from ITC (not eligible, or not yet reviewed) — surfaced so nothing is silently dropped. */
    excludedCount: number;
    /** Expenses still in the review queue within the period — a "finish these before filing" nudge. */
    pendingReviewCount: number;
  };
  outward: {
    /** Zero-rated export turnover by currency (invoices are single-currency exports). */
    byCurrency: CurrencyTotal[];
    invoiceCount: number;
  };
};

const AMOUNT = (n: number | null): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export function buildGstPrepPack(period: string, expenses: PrepExpense[], invoices: PrepInvoice[]): GstPrepPack {
  const headTotals = new Map<string, { count: number; total: number }>();
  let itcEligibleTotal = 0;
  let itcEligibleCount = 0;
  let excludedCount = 0;
  let pendingReviewCount = 0;

  for (const e of expenses) {
    if (e.status === 'pending_review') pendingReviewCount += 1;
    // ITC counts only a reviewed/booked, ITC-eligible expense — never a rejected or unreviewed one.
    const booked = e.status === 'approved' || e.status === 'auto_posted';
    if (booked && e.itcEligible) {
      const head = e.gstHead ?? 'Other';
      const bucket = headTotals.get(head) ?? { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += AMOUNT(e.amount);
      headTotals.set(head, bucket);
      itcEligibleTotal += AMOUNT(e.amount);
      itcEligibleCount += 1;
    } else {
      excludedCount += 1;
    }
  }

  const byHead = [...headTotals.entries()]
    .map(([gstHead, v]) => ({ gstHead, count: v.count, total: round2(v.total) }))
    .sort((a, b) => b.total - a.total);

  const currencyTotals = new Map<string, { count: number; total: number }>();
  for (const inv of invoices) {
    const bucket = currencyTotals.get(inv.currency) ?? { count: 0, total: 0 };
    bucket.count += 1;
    // Credit/debit notes net against turnover.
    bucket.total += inv.isCreditOrDebitNote ? -AMOUNT(inv.total) : AMOUNT(inv.total);
    currencyTotals.set(inv.currency, bucket);
  }
  const byCurrency = [...currencyTotals.entries()]
    .map(([currency, v]) => ({ currency, count: v.count, total: round2(v.total) }))
    .sort((a, b) => b.total - a.total);

  return {
    period,
    input: {
      byHead,
      itcEligibleTotal: round2(itcEligibleTotal),
      itcEligibleCount,
      excludedCount,
      pendingReviewCount,
    },
    outward: { byCurrency, invoiceCount: invoices.length },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** [start, end) for a "YYYY-MM" period, in UTC. Throws on a malformed period so the action can 400 cleanly. */
export function periodBounds(period: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error('Period must be in YYYY-MM format');
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error('Period month must be between 01 and 12');
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}
