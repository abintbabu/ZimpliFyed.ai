// Purchase orders (M9). Pure — no DB. A PO is the document that turns an awarded vendor RFQ into an
// instruction the vendor can act on; until now the flow dead-ended at "awarded".

export type PoStatus = 'draft' | 'issued' | 'acknowledged' | 'received' | 'cancelled';

const TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['acknowledged', 'received', 'cancelled'],
  acknowledged: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export function canTransitionPo(from: PoStatus, to: PoStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextPoStatuses(from: PoStatus): PoStatus[] {
  return TRANSITIONS[from];
}

/** Only a draft may have its lines or commercial terms changed — an issued PO is what the vendor holds. */
export function isPoEditable(status: PoStatus): boolean {
  return status === 'draft';
}

export type PoLineInput = { description: string; sku?: string | null; quantity: number; uom?: string | null; unitPrice: number };

export type NormalizedPoLine = { description: string; sku: string | null; quantity: number; uom: string | null; unitPrice: number; lineTotal: number; sortOrder: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Drops blank rows, validates the rest, derives line totals. Throws a message naming the offending line. */
export function normalizePoLines(lines: PoLineInput[]): NormalizedPoLine[] {
  return lines
    .filter((l) => l.description.trim() !== '')
    .map((l, i) => {
      const description = l.description.trim();
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new Error(`Line "${description}": quantity must be above 0`);
      if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) throw new Error(`Line "${description}": unit price cannot be negative`);
      return { description, sku: l.sku?.trim() || null, quantity: l.quantity, uom: l.uom?.trim() || null, unitPrice: l.unitPrice, lineTotal: round2(l.quantity * l.unitPrice), sortOrder: i };
    });
}

export function poTotal(lines: { lineTotal: number }[]): number {
  return round2(lines.reduce((s, l) => s + l.lineTotal, 0));
}

/**
 * Builds the starting line from an awarded RFQ. The RFQ may carry no quantity; the fallback chain (RFQ
 * quantity → vendor MOQ → 1) only seeds an editable draft, and `quantityAssumed` tells the UI to say so.
 */
export function poLineFromAward(
  rfq: { title: string; description: string | null; quantity: number | null; unit: string | null },
  quote: { rate: number; moqPieces: number | null },
): { line: PoLineInput; quantityAssumed: boolean } {
  const quantity = rfq.quantity && rfq.quantity > 0 ? rfq.quantity : quote.moqPieces && quote.moqPieces > 0 ? quote.moqPieces : 1;
  return {
    line: { description: rfq.description ? `${rfq.title} — ${rfq.description}` : rfq.title, quantity, uom: rfq.unit, unitPrice: quote.rate },
    quantityAssumed: !(rfq.quantity && rfq.quantity > 0),
  };
}

/** Requested delivery date: today + the vendor's quoted lead time, or null when none was quoted. */
export function defaultDeliveryDate(now: Date, leadTimeDays: number | null): Date | null {
  if (!leadTimeDays || leadTimeDays <= 0) return null;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + leadTimeDays));
}
