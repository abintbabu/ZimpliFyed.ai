// Inventory-lite (V2). Pure — no DB. Stock is the sum of signed movements — never a stored counter that can
// drift. Valuation and multi-warehouse transfer logic are deliberately out of scope (ROADMAP: "full WMS is
// out of scope permanently").

export type MovementKind = 'receipt' | 'issue' | 'adjustment';

export type Movement = { itemId: string; kind: MovementKind; quantity: number };

/** Signed delta a movement applies: receipts add, issues subtract, adjustments are already signed. */
export function delta(kind: MovementKind, quantity: number): number {
  if (kind === 'receipt') return Math.abs(quantity);
  if (kind === 'issue') return -Math.abs(quantity);
  return quantity;
}

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function balances(movements: Movement[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of movements) m.set(x.itemId, r3((m.get(x.itemId) ?? 0) + delta(x.kind, x.quantity)));
  return m;
}

/** Returns an error message when a proposed movement is invalid, or null. Issues may not overdraw. */
export function validateMovement(current: number, kind: MovementKind, quantity: number): string | null {
  if (!Number.isFinite(quantity) || quantity === 0) return 'Quantity must be a non-zero number.';
  if (kind !== 'adjustment' && quantity < 0) return `Enter ${kind} quantities as positive numbers.`;
  const after = r3(current + delta(kind, quantity));
  if (after < 0) return `Not enough stock: ${current} on hand, this would leave ${after}.`;
  return null;
}

export type LowStock = { itemId: string; onHand: number; reorderLevel: number; shortBy: number };

/** Items at or below their reorder level. Items without a level are never flagged. */
export function lowStock(items: { id: string; reorderLevel: number | null }[], bal: Map<string, number>): LowStock[] {
  return items
    .filter((i) => i.reorderLevel != null)
    .map((i) => ({ itemId: i.id, onHand: bal.get(i.id) ?? 0, reorderLevel: i.reorderLevel as number }))
    .filter((x) => x.onHand <= x.reorderLevel)
    .map((x) => ({ ...x, shortBy: r3(x.reorderLevel - x.onHand) }))
    .sort((a, b) => b.shortBy - a.shortBy);
}
