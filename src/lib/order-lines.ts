// Order line items (M1). Pure helpers — no DB — shared by the save action, the editor panel and tests.
// The order header's legacy `product` / `quantity` stay populated (dual-write) from these lines until
// the contract phase of docs/EXPAND_CONTRACT_MIGRATIONS.md, so nothing reading the header breaks.

export type OrderLineInput = {
  productId?: string | null;
  description: string;
  hsCode?: string | null;
  quantity: number;
  uom?: string | null;
  unitPrice: number;
};

export type NormalizedOrderLine = {
  productId: string | null;
  description: string;
  hsCode: string | null;
  quantity: number;
  uom: string | null;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Validates and normalises lines. Blank-description rows are dropped; anything else invalid throws. */
export function normalizeOrderLines(lines: OrderLineInput[]): NormalizedOrderLine[] {
  const kept = lines.filter((l) => l.description.trim() !== '');
  return kept.map((l, i) => {
    const description = l.description.trim();
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
      throw new Error(`Line "${description}": quantity must be greater than 0`);
    }
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) {
      throw new Error(`Line "${description}": unit price cannot be negative`);
    }
    const hs = l.hsCode?.replace(/[\s.]/g, '') || null;
    return {
      productId: l.productId || null,
      description,
      hsCode: hs,
      quantity: l.quantity,
      uom: l.uom?.trim() || null,
      unitPrice: l.unitPrice,
      lineTotal: round2(l.quantity * l.unitPrice),
      sortOrder: i,
    };
  });
}

export type OrderLineTotals = {
  total: number;
  totalQuantity: number;
  /** Header-compatible product summary: "First line +N more". Null when there are no lines. */
  productSummary: string | null;
  /** The single uom when every line shares one, otherwise null (mixed units can't be summed meaningfully). */
  uom: string | null;
};

export function summarizeOrderLines(lines: NormalizedOrderLine[]): OrderLineTotals {
  if (lines.length === 0) return { total: 0, totalQuantity: 0, productSummary: null, uom: null };
  const uoms = new Set(lines.map((l) => l.uom ?? ''));
  return {
    total: round2(lines.reduce((s, l) => s + l.lineTotal, 0)),
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    productSummary: lines.length > 1 ? `${lines[0].description} +${lines.length - 1} more` : lines[0].description,
    uom: uoms.size === 1 ? lines[0].uom : null,
  };
}
