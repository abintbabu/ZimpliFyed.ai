import 'server-only';
import { prisma } from './prisma';

export type CashFlowBucket = {
  label: string;
  from: Date;
  to: Date;
  receivables: number;
};

export type CashFlowForecast = {
  asOf: Date;
  overdueReceivables: number;
  buckets: CashFlowBucket[];
  scheduledReceivablesTotal: number;
  /** Distinct invoice currencies feeding the receivables figures — if more than one, the totals mix currencies without FX conversion, so callers should flag that instead of presenting a single clean number. */
  receivablesCurrencies: string[];
  /** INR — export incentive schemes are government-disbursed in INR regardless of invoice currency, so kept separate rather than summed into receivables. */
  incentivesPipeline: number;
};

const WEEK_MS = 7 * 86_400_000;
const BUCKET_COUNT = 6;

/**
 * Cash-flow forecast (PRODUCT_PLAN §27): weekly receivables due, plus the
 * incentive pipeline, over the next ~6 weeks. Sourced from `Invoice.balanceDue`
 * (kept current by bank-realization reconciliation, see bank-realizations.ts)
 * and claimable `IncentiveClaim`s — the only two payment-schedule sources this
 * tenant actually has data for today.
 *
 * Deliberately doesn't include vendor dues/payables: that requires the
 * finance/expenses module, which ROADMAP.md defers ("port later, on demand").
 * Forecasting fabricated payables would be worse than omitting them.
 */
export async function buildCashFlowForecast(tenantId: string): Promise<CashFlowForecast> {
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + BUCKET_COUNT * WEEK_MS);

  const [openInvoices, claimableIncentives] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, isDemo: false, isCreditOrDebitNote: false, balanceDue: { gt: 0.01 } },
    }),
    prisma.incentiveClaim.findMany({ where: { tenantId, status: 'claimable' } }).catch(() => []),
  ]);

  const overdue = openInvoices.filter((i) => i.dueDate && i.dueDate < now);
  const overdueReceivables = parseFloat(overdue.reduce((s, i) => s + i.balanceDue, 0).toFixed(2));

  const buckets: CashFlowBucket[] = Array.from({ length: BUCKET_COUNT }, (_, i) => {
    const from = new Date(now.getTime() + i * WEEK_MS);
    const to = new Date(now.getTime() + (i + 1) * WEEK_MS);
    return { label: `Week ${i + 1}`, from, to, receivables: 0 };
  });

  for (const invoice of openInvoices) {
    if (!invoice.dueDate || invoice.dueDate < now || invoice.dueDate >= horizonEnd) continue;
    const bucket = buckets.find((b) => invoice.dueDate! >= b.from && invoice.dueDate! < b.to);
    if (bucket) bucket.receivables = parseFloat((bucket.receivables + invoice.balanceDue).toFixed(2));
  }

  const incentivesPipeline = parseFloat(
    (claimableIncentives as { amount: number }[]).reduce((s, c) => s + c.amount, 0).toFixed(2),
  );

  const scheduledReceivablesTotal = parseFloat(
    (overdueReceivables + buckets.reduce((s, b) => s + b.receivables, 0)).toFixed(2),
  );
  const receivablesCurrencies = [...new Set(openInvoices.map((i) => i.currency))];

  return { asOf: now, overdueReceivables, buckets, scheduledReceivablesTotal, receivablesCurrencies, incentivesPipeline };
}
