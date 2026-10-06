// Report-pack aggregations (M7). Pure — no DB, no clock — so every figure on /dashboard/analytics is
// unit-tested and reproducible. Money is only ever summed after conversion into one reporting currency
// (see fx.ts); a currency with no rate is excluded and named, never guessed.

import { signedInvoiceTotal, type NoteKind } from './invoice-notes';
import type { ReportingPlan } from './fx';

const DAY = 86_400_000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type InvoiceRow = {
  total: number;
  balanceDue: number;
  currency: string;
  status: string;
  dueDate: Date | null;
  createdAt: Date;
  isCreditOrDebitNote: boolean;
  noteKind?: NoteKind | null;
};

// ── Receivables ageing ───────────────────────────────────────────────────────

export type AgeingBucketKey = 'not_due' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus' | 'no_due_date';

export const AGEING_LABELS: Record<AgeingBucketKey, string> = {
  not_due: 'Not yet due',
  d1_30: '1–30 days overdue',
  d31_60: '31–60 days overdue',
  d61_90: '61–90 days overdue',
  d90_plus: '90+ days overdue',
  no_due_date: 'No due date',
};

const AGEING_ORDER: AgeingBucketKey[] = ['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'no_due_date'];

function utcDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function ageingBucketFor(dueDate: Date | null, now: Date): AgeingBucketKey {
  if (!dueDate) return 'no_due_date';
  const overdueDays = Math.round((utcDay(now) - utcDay(dueDate)) / DAY);
  if (overdueDays <= 0) return 'not_due';
  if (overdueDays <= 30) return 'd1_30';
  if (overdueDays <= 60) return 'd31_60';
  if (overdueDays <= 90) return 'd61_90';
  return 'd90_plus';
}

export type AgeingReport = {
  buckets: { key: AgeingBucketKey; label: string; amount: number; count: number }[];
  total: number;
  /** Open invoices left out because their currency has no exchange rate. */
  excludedCount: number;
};

/** Open receivables by age. Only live, non-note invoices with a balance count (drafts and voids are not owed). */
export function receivablesAgeing(rows: InvoiceRow[], now: Date, plan: ReportingPlan): AgeingReport {
  const acc = new Map<AgeingBucketKey, { amount: number; count: number }>(AGEING_ORDER.map((k) => [k, { amount: 0, count: 0 }]));
  let excludedCount = 0;

  for (const r of rows) {
    if (r.isCreditOrDebitNote || r.balanceDue <= 0.01) continue;
    if (r.status === 'draft' || r.status === 'void' || r.status === 'paid') continue;
    const converted = plan.convert(r.balanceDue, r.currency);
    if (converted == null) { excludedCount += 1; continue; }
    const b = acc.get(ageingBucketFor(r.dueDate, now))!;
    b.amount += converted;
    b.count += 1;
  }

  const buckets = AGEING_ORDER.map((key) => ({ key, label: AGEING_LABELS[key], amount: round2(acc.get(key)!.amount), count: acc.get(key)!.count }));
  return { buckets, total: round2(buckets.reduce((s, b) => s + b.amount, 0)), excludedCount };
}

// ── Revenue by month ─────────────────────────────────────────────────────────

export type RevenuePoint = { month: string; revenue: number };

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Last `months` calendar months (UTC, oldest first, zeros included) of invoiced revenue, credit notes netted. */
export function revenueByMonth(rows: InvoiceRow[], now: Date, plan: ReportingPlan, months = 12): { points: RevenuePoint[]; excludedCount: number } {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  const totals = new Map<string, number>(keys.map((k) => [k, 0]));
  let excludedCount = 0;

  for (const r of rows) {
    if (r.status === 'draft' || r.status === 'void') continue;
    const k = monthKey(r.createdAt);
    if (!totals.has(k)) continue;
    const converted = plan.convert(signedInvoiceTotal(r), r.currency);
    if (converted == null) { excludedCount += 1; continue; }
    totals.set(k, totals.get(k)! + converted);
  }
  return { points: keys.map((month) => ({ month, revenue: round2(totals.get(month)!) })), excludedCount };
}

// ── Quoted margin by buyer / country / product ───────────────────────────────

export type MarginOrder = {
  buyerName: string | null;
  country: string | null;
  status: string;
  currency: string;
  lines: { description: string; quantity: number; cost: number; lineTotal: number }[];
};

export type MarginDimension = 'buyer' | 'country' | 'product';

export type MarginRow = { label: string; revenue: number; cost: number; margin: number; marginPct: number | null; orders: number };

export type MarginReport = {
  rows: MarginRow[];
  /** Lines with no recorded cost — excluded from margin because a 100% "margin" on unknown cost is a lie. */
  linesWithoutCost: number;
  excludedCount: number;
};

/**
 * Quoted margin (sell price vs. the cost recorded on the quote line) across non-cancelled orders. Only lines
 * with a cost enter the figures; the rest are counted, not silently treated as free.
 */
export function marginBreakdown(orders: MarginOrder[], dimension: MarginDimension, plan: ReportingPlan): MarginReport {
  const acc = new Map<string, { revenue: number; cost: number; orders: Set<number> }>();
  let linesWithoutCost = 0;
  let excludedCount = 0;

  orders.forEach((o, idx) => {
    if (o.status === 'cancelled') return;
    for (const l of o.lines) {
      if (!(l.cost > 0)) { linesWithoutCost += 1; continue; }
      const revenue = plan.convert(l.lineTotal, o.currency);
      const cost = plan.convert(l.cost * l.quantity, o.currency);
      if (revenue == null || cost == null) { excludedCount += 1; continue; }
      const label =
        dimension === 'buyer' ? o.buyerName?.trim() || 'No buyer'
        : dimension === 'country' ? o.country?.trim() || 'Unknown country'
        : l.description.trim() || 'Unnamed product';
      const a = acc.get(label) ?? { revenue: 0, cost: 0, orders: new Set<number>() };
      a.revenue += revenue; a.cost += cost; a.orders.add(idx);
      acc.set(label, a);
    }
  });

  const rows = [...acc.entries()]
    .map(([label, a]) => ({
      label,
      revenue: round2(a.revenue),
      cost: round2(a.cost),
      margin: round2(a.revenue - a.cost),
      marginPct: a.revenue > 0 ? round2(((a.revenue - a.cost) / a.revenue) * 100) : null,
      orders: a.orders.size,
    }))
    .sort((x, y) => y.revenue - x.revenue || x.label.localeCompare(y.label));
  return { rows, linesWithoutCost, excludedCount };
}

// ── Order pipeline ───────────────────────────────────────────────────────────

export const ORDER_STATUS_ORDER = ['confirmed', 'in_production', 'shipped', 'in_transit', 'delivered', 'cancelled'] as const;

export function orderPipeline(orders: { status: string; value: number; currency: string }[], plan: ReportingPlan) {
  const acc = new Map<string, { count: number; value: number }>(ORDER_STATUS_ORDER.map((s) => [s, { count: 0, value: 0 }]));
  let excludedCount = 0;
  for (const o of orders) {
    const a = acc.get(o.status) ?? { count: 0, value: 0 };
    a.count += 1;
    const v = plan.convert(o.value, o.currency);
    if (v == null) excludedCount += 1; else a.value += v;
    acc.set(o.status, a);
  }
  return {
    stages: [...acc.entries()].map(([status, a]) => ({ status, count: a.count, value: round2(a.value) })),
    excludedCount,
  };
}

// ── Shipment milestone performance ───────────────────────────────────────────

export type MilestoneRow = { plannedAt: Date | null; actualAt: Date | null };

export type ShipmentPerformance = {
  onTime: number;
  late: number;
  /** Planned date has passed and nothing was recorded. */
  overdueOpen: number;
  upcoming: number;
  /** onTime / (onTime + late), as a percentage; null when nothing has completed yet. */
  onTimePct: number | null;
  avgDelayDays: number | null;
};

/** On-time rate of milestones that carry a planned date. A milestone is on time if it happened by its planned day. */
export function shipmentPerformance(rows: MilestoneRow[], now: Date): ShipmentPerformance {
  let onTime = 0, late = 0, overdueOpen = 0, upcoming = 0, delaySum = 0;
  for (const m of rows) {
    if (!m.plannedAt) continue;
    if (m.actualAt) {
      const delay = Math.round((utcDay(m.actualAt) - utcDay(m.plannedAt)) / DAY);
      if (delay <= 0) onTime += 1; else { late += 1; delaySum += delay; }
    } else if (utcDay(m.plannedAt) < utcDay(now)) overdueOpen += 1;
    else upcoming += 1;
  }
  const done = onTime + late;
  return {
    onTime, late, overdueOpen, upcoming,
    onTimePct: done > 0 ? round2((onTime / done) * 100) : null,
    avgDelayDays: late > 0 ? round2(delaySum / late) : null,
  };
}
