// Supplier scorecard (V2). Pure — no DB.
//
// Built only from what the system actually recorded: a PO's requested delivery date against the date it was
// received, quantities received vs rejected on goods receipts, and the unit prices paid over time. A supplier
// with too little history is shown as "not enough data" — a score from one purchase order is noise dressed as a
// grade.

export type ScorecardPo = {
  poNumber: string;
  createdAt: Date;
  deliveryDate: Date | null;
  receivedAt: Date | null;
  status: string;
  lines: { description: string; unitPrice: number }[];
};

export type ScorecardReceiptLine = { qtyReceived: number; qtyRejected: number };

export type Scorecard = {
  orders: number;
  /** POs with both a promised and an actual date. */
  measuredDeliveries: number;
  onTimePct: number | null;
  avgDelayDays: number | null;
  /** Rejected as a share of everything received. */
  rejectionPct: number | null;
  /** % change in unit price for goods bought more than once, first → latest (volume-weighted by description). */
  priceTrendPct: number | null;
  /** 0–100, only when there is enough data; weights: on-time 60, quality 40. */
  score: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | null;
  enoughData: boolean;
};

export const MIN_ORDERS_FOR_SCORE = 3;

const DAY = 86_400_000;
const r1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function buildScorecard(pos: ScorecardPo[], receiptLines: ScorecardReceiptLine[]): Scorecard {
  const live = pos.filter((p) => p.status !== 'cancelled' && p.status !== 'draft');

  let onTime = 0, measured = 0, delaySum = 0, late = 0;
  for (const p of live) {
    if (!p.deliveryDate || !p.receivedAt) continue;
    measured += 1;
    const delay = Math.round((utcDay(p.receivedAt) - utcDay(p.deliveryDate)) / DAY);
    if (delay <= 0) onTime += 1; else { late += 1; delaySum += delay; }
  }
  const onTimePct = measured > 0 ? r1((onTime / measured) * 100) : null;
  const avgDelayDays = late > 0 ? r1(delaySum / late) : null;

  const received = receiptLines.reduce((s, l) => s + l.qtyReceived, 0);
  const rejected = receiptLines.reduce((s, l) => s + l.qtyRejected, 0);
  const rejectionPct = received > 0 ? r1((rejected / received) * 100) : null;

  // Price trend: for each description bought ≥ 2 times, change from first to latest purchase.
  const byDesc = new Map<string, { at: number; price: number }[]>();
  for (const p of live) for (const l of p.lines) {
    const k = l.description.trim().toLowerCase();
    if (l.unitPrice > 0) byDesc.set(k, [...(byDesc.get(k) ?? []), { at: p.createdAt.getTime(), price: l.unitPrice }]);
  }
  const changes: number[] = [];
  for (const pts of byDesc.values()) {
    if (pts.length < 2) continue;
    pts.sort((a, b) => a.at - b.at);
    changes.push(((pts[pts.length - 1].price - pts[0].price) / pts[0].price) * 100);
  }
  const priceTrendPct = changes.length ? r1(changes.reduce((s, c) => s + c, 0) / changes.length) : null;

  const enoughData = live.length >= MIN_ORDERS_FOR_SCORE && (onTimePct != null || rejectionPct != null);
  let score: number | null = null;
  if (enoughData) {
    const parts: { v: number; w: number }[] = [];
    if (onTimePct != null) parts.push({ v: onTimePct, w: 60 });
    if (rejectionPct != null) parts.push({ v: Math.max(0, 100 - rejectionPct * 5), w: 40 }); // 20% rejection → 0
    const wsum = parts.reduce((s, p) => s + p.w, 0);
    score = Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / wsum);
  }
  const grade = score == null ? null : score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
  return { orders: live.length, measuredDeliveries: measured, onTimePct, avgDelayDays, rejectionPct, priceTrendPct, score, grade, enoughData };
}
