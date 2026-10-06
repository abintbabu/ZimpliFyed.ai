// Goods receipt (V2). Pure — no DB. A PO can be received in several deliveries; "fully received" is derived from
// the cumulative quantity across receipts, never from a flag someone ticks.

export type ReceiptLineInput = { poLineId: string | null; description: string; qtyReceived: number; qtyRejected: number; rejectReason?: string | null };

export type PoLineRef = { id: string; description: string; quantity: number };

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Returns an error message for a proposed receipt, or null. */
export function validateReceipt(lines: ReceiptLineInput[], poLines: PoLineRef[]): string | null {
  // Any non-zero value is a line to validate — a negative must be rejected, not silently dropped as "blank".
  const live = lines.filter((l) => l.qtyReceived !== 0 || l.qtyRejected !== 0);
  if (live.length === 0) return 'Enter a received quantity on at least one line.';
  const known = new Set(poLines.map((l) => l.id));
  for (const l of live) {
    const name = l.description || 'a line';
    if (!Number.isFinite(l.qtyReceived) || l.qtyReceived < 0 || !Number.isFinite(l.qtyRejected) || l.qtyRejected < 0) return `${name}: quantities cannot be negative.`;
    if (l.qtyRejected > l.qtyReceived) return `${name}: rejected (${l.qtyRejected}) cannot exceed received (${l.qtyReceived}).`;
    if (l.qtyRejected > 0 && !(l.rejectReason ?? '').trim()) return `${name}: give a reason for the rejected quantity.`;
    if (l.poLineId && !known.has(l.poLineId)) return `${name}: that line is not on this purchase order.`;
  }
  return null;
}

export type LineProgress = { poLineId: string; description: string; ordered: number; received: number; rejected: number; accepted: number; remaining: number };

/** Per-line cumulative progress across all receipts so far. */
export function poReceiptProgress(poLines: PoLineRef[], receipts: ReceiptLineInput[][]): { lines: LineProgress[]; complete: boolean; anyReceived: boolean } {
  const lines = poLines.map((p) => {
    let received = 0, rejected = 0;
    for (const r of receipts) for (const l of r) if (l.poLineId === p.id) { received += l.qtyReceived; rejected += l.qtyRejected; }
    const accepted = r3(received - rejected);
    return { poLineId: p.id, description: p.description, ordered: p.quantity, received: r3(received), rejected: r3(rejected), accepted, remaining: Math.max(0, r3(p.quantity - received)) };
  });
  return { lines, complete: lines.length > 0 && lines.every((l) => l.remaining <= 0.0005), anyReceived: lines.some((l) => l.received > 0) };
}
