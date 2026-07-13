import { computeLandedCost } from '@/lib/landed-cost';
import type { CostCategory } from '@prisma/client';

export type OrderPnlInput = {
  quote: {
    total: number;
    lines: { quantity: number; cost: number; unitPrice: number; lineTotal: number }[];
  } | null;
  costSheet: {
    incoterm: string;
    sellPricePerUnit: number;
    rodtepPct: number;
    lines: { category: CostCategory; amountPerUnit: number }[];
  } | null;
  invoices: { total: number; isCreditOrDebitNote: boolean }[];
  incentiveAmounts: number[]; // claimed or received incentive claim amounts for this order
  bookedExpenses: number[]; // auto-posted/approved snapped expenses attributed to this order (Sprint 4)
};

export type OrderPnlResult = {
  quotedRevenue: number;
  quotedCost: number;
  quotedMarginPct: number | null;
  actualRevenue: number;
  landedCostPerUnit: number | null;
  incentiveCredits: number;
  bookedExpenses: number;
  actualMarginPct: number | null;
  hasCostSheet: boolean;
};

/**
 * Order-level P&L: quoted margin (from the quote's flat cost/expense/margin lines) vs actual
 * margin (actual invoiced revenue, landed cost per the cost sheet if one exists, plus incentive
 * credit-back). Forex variance is intentionally out of scope — there's no exchange-rate booking
 * model yet to compare booked vs realized rates against.
 */
export function computeOrderPnl(input: OrderPnlInput): OrderPnlResult {
  const quotedRevenue = input.quote?.total ?? 0;
  const quotedCost = input.quote?.lines.reduce((sum, l) => sum + l.cost * l.quantity, 0) ?? 0;
  const quotedMarginPct = quotedRevenue > 0 ? parseFloat((((quotedRevenue - quotedCost) / quotedRevenue) * 100).toFixed(2)) : null;

  const actualRevenue = input.invoices
    .filter((i) => !i.isCreditOrDebitNote)
    .reduce((sum, i) => sum + i.total, 0);

  const incentiveCredits = input.incentiveAmounts.reduce((sum, a) => sum + a, 0);
  const bookedExpenses = input.bookedExpenses.reduce((sum, a) => sum + a, 0);

  let landedCostPerUnit: number | null = null;
  let actualMarginPct: number | null = null;

  if (input.costSheet) {
    const landed = computeLandedCost({
      incoterm: input.costSheet.incoterm,
      sellPricePerUnit: input.costSheet.sellPricePerUnit,
      rodtepPct: input.costSheet.rodtepPct,
      lines: input.costSheet.lines,
    });
    landedCostPerUnit = landed.landedCostPerUnit;

    const totalQuantity = input.quote?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0;
    const totalLandedCost = landedCostPerUnit * totalQuantity;
    actualMarginPct = actualRevenue > 0
      ? parseFloat((((actualRevenue + incentiveCredits - totalLandedCost - bookedExpenses) / actualRevenue) * 100).toFixed(2))
      : null;
  } else if (actualRevenue > 0) {
    actualMarginPct = parseFloat((((actualRevenue + incentiveCredits - quotedCost - bookedExpenses) / actualRevenue) * 100).toFixed(2));
  }

  return {
    quotedRevenue: parseFloat(quotedRevenue.toFixed(2)),
    quotedCost: parseFloat(quotedCost.toFixed(2)),
    quotedMarginPct,
    actualRevenue: parseFloat(actualRevenue.toFixed(2)),
    landedCostPerUnit,
    incentiveCredits: parseFloat(incentiveCredits.toFixed(2)),
    bookedExpenses: parseFloat(bookedExpenses.toFixed(2)),
    actualMarginPct,
    hasCostSheet: !!input.costSheet,
  };
}
