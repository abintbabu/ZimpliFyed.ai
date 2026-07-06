// Shared expense%/margin% build-up used by quote and invoice line items.
// Cost is the vendor rate; expense% and margin% are applied here, downstream,
// to turn that cost into a sell price.

export const DEFAULT_EXPENSE_PCT = 0;
export const DEFAULT_MARGIN_PCT = 20;

/** Price = cost marked up by expense%, then margin-on-price applied. */
export function priceFromCostAndMargin(costPerUnit: number, marginPct: number): number {
  if (marginPct >= 100) return costPerUnit; // guard: 100% margin-on-price is undefined
  const price = costPerUnit / (1 - marginPct / 100);
  return parseFloat(price.toFixed(2));
}

export function marginPctFromCostPrice(costPerUnit: number, unitPrice: number): number | undefined {
  if (!unitPrice || unitPrice <= 0) return undefined;
  return parseFloat((((unitPrice - costPerUnit) / unitPrice) * 100).toFixed(2));
}

/** Sell price = cost marked up by expense%, then margin-on-price applied. */
export function computeSellPrice(costPerUnit: number, expensePct: number, marginPct: number): number {
  const withExpense = costPerUnit * (1 + (expensePct || 0) / 100);
  return priceFromCostAndMargin(withExpense, marginPct || 0);
}

/** Implied margin% (on price) for a given cost/expense%/price triple. */
export function marginPctFromCostExpensePrice(
  costPerUnit: number,
  expensePct: number,
  unitPrice: number,
): number | undefined {
  const withExpense = costPerUnit * (1 + (expensePct || 0) / 100);
  return marginPctFromCostPrice(withExpense, unitPrice);
}

type CostedLine = {
  cost?: number;
  expensePct?: number;
  marginPct?: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

/**
 * Expense % and margin % are mandatory for every costed line before a quote or
 * invoice is saved/sent - any line missing either is filled with the fallback
 * default here (rather than left blank) and its price recomputed.
 */
export function withDefaultExpenseMargin<T extends CostedLine>(items: T[]): T[] {
  return items.map(li => {
    if (li.cost == null || li.cost <= 0) return li;
    if (li.expensePct != null && li.marginPct != null) return li;
    const expensePct = li.expensePct ?? DEFAULT_EXPENSE_PCT;
    const marginPct = li.marginPct ?? DEFAULT_MARGIN_PCT;
    const unitPrice = computeSellPrice(li.cost, expensePct, marginPct);
    return { ...li, expensePct, marginPct, unitPrice, lineTotal: parseFloat((li.quantity * unitPrice).toFixed(2)) };
  });
}
