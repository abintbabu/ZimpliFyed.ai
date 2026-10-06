// Margin-leak decomposition (V2). Pure — no DB. Explains WHERE an order's margin went: the quoted profit minus
// the actual profit, split into additive components that sum EXACTLY to the gap. Deterministic on purpose — an
// explanation of money has to add up; a model's narrative can be layered on top of this later.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type MarginLeakInput = {
  quotedRevenue: number;
  quotedCost: number;
  /** Invoiced revenue excluding credit/debit notes. */
  grossInvoiced: number;
  creditNotes: number;
  debitNotes: number;
  /** Cost actually incurred (landed cost × quantity when a cost sheet exists; otherwise the quoted cost). */
  actualCost: number;
  bookedExpenses: number;
  incentives: number;
};

export type Leak = { key: 'credit_notes' | 'debit_notes' | 'unbilled' | 'cost_overrun' | 'expenses' | 'incentives'; label: string; /** Profit lost (+) or recovered (−). */ amount: number };

export type MarginLeakReport = {
  quotedProfit: number;
  actualProfit: number;
  /** quotedProfit − actualProfit. Positive = margin leaked. */
  gap: number;
  /** Largest drivers first; recoveries (negative) last. Sums to `gap`. */
  leaks: Leak[];
  quotedMarginPct: number | null;
  actualMarginPct: number | null;
  /** Percentage-point drop in margin, when both are defined. */
  gapPts: number | null;
  flagged: boolean;
};

/** Margin drop (in points) at which an order is flagged for attention. */
export const LEAK_FLAG_PTS = 5;

export function explainMarginGap(i: MarginLeakInput): MarginLeakReport {
  const actualRevenue = i.grossInvoiced + i.debitNotes - i.creditNotes;
  const quotedProfit = i.quotedRevenue - i.quotedCost;
  const actualProfit = actualRevenue + i.incentives - i.actualCost - i.bookedExpenses;

  const raw: Leak[] = [
    { key: 'unbilled', label: 'Billed less than quoted', amount: i.quotedRevenue - i.grossInvoiced },
    { key: 'credit_notes', label: 'Credit notes issued', amount: i.creditNotes },
    { key: 'debit_notes', label: 'Debit notes raised', amount: -i.debitNotes },
    { key: 'cost_overrun', label: 'Costs above the quote', amount: i.actualCost - i.quotedCost },
    { key: 'expenses', label: 'Booked expenses', amount: i.bookedExpenses },
    { key: 'incentives', label: 'Export incentives', amount: -i.incentives },
  ];
  const all = raw.map((l) => ({ ...l, amount: r2(l.amount) }));

  const leaks = all.filter((l) => Math.abs(l.amount) >= 0.005).sort((a, b) => b.amount - a.amount);
  const quotedMarginPct = i.quotedRevenue > 0 ? r2((quotedProfit / i.quotedRevenue) * 100) : null;
  const actualMarginPct = actualRevenue > 0 ? r2((actualProfit / actualRevenue) * 100) : null;
  const gapPts = quotedMarginPct != null && actualMarginPct != null ? r2(quotedMarginPct - actualMarginPct) : null;
  return {
    quotedProfit: r2(quotedProfit),
    actualProfit: r2(actualProfit),
    gap: r2(quotedProfit - actualProfit),
    leaks,
    quotedMarginPct,
    actualMarginPct,
    gapPts,
    flagged: gapPts != null && gapPts >= LEAK_FLAG_PTS,
  };
}
