// Cost-sheet suggestions from the tenant's own history (V2). Pure — no DB, no LLM.
//
// "AI cost-sheet pre-fill" is first a data problem: the tenant has already costed this kind of shipment
// before. The median of what they actually entered, per cost head, is a defensible starting point and — unlike
// a model's guess — can say exactly where each number came from. Every suggestion carries its sample size and
// range so the UI can show how much to trust it, and a head with too little history is not suggested at all.

import type { CostCategory } from '@prisma/client';

export type HistoricSheet = {
  quoteId: string;
  incoterm: string;
  currency: string;
  createdAt: Date;
  lines: { category: CostCategory; amountPerUnit: number }[];
};

export type CostSuggestion = {
  category: CostCategory;
  /** Median of the per-unit amounts seen, 2dp. */
  amountPerUnit: number;
  min: number;
  max: number;
  /** Number of past sheets that contributed. */
  samples: number;
  /** 'low' under 3 samples, 'high' at 5+ with a tight spread (max ≤ 1.5 × min). */
  confidence: 'low' | 'medium' | 'high';
};

export const MIN_SAMPLES = 2;
export const MAX_SHEETS_CONSIDERED = 20;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function median(sorted: number[]): number {
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

/**
 * Suggests per-unit amounts for each cost category from past sheets in the SAME currency. Same-incoterm
 * sheets are preferred; when fewer than MIN_SAMPLES of them have a head, other incoterms' figures for that
 * head are used so a first FOB sheet can still borrow a CIF sheet's packing cost. Zero amounts are ignored
 * (an empty line is "not entered", not "free").
 */
export function suggestCostsFromHistory(
  history: HistoricSheet[],
  target: { incoterm: string; currency: string },
  excludeQuoteId?: string,
): CostSuggestion[] {
  const sheets = history
    .filter((h) => h.quoteId !== excludeQuoteId && h.currency.toUpperCase() === target.currency.toUpperCase())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_SHEETS_CONSIDERED);

  const pool = (sameTerm: boolean) => {
    const by = new Map<CostCategory, number[]>();
    for (const s of sheets) {
      if (sameTerm && s.incoterm !== target.incoterm) continue;
      // One value per sheet per category: sum duplicate lines of the same head within a sheet.
      const perSheet = new Map<CostCategory, number>();
      for (const l of s.lines) if (l.amountPerUnit > 0) perSheet.set(l.category, (perSheet.get(l.category) ?? 0) + l.amountPerUnit);
      for (const [c, v] of perSheet) by.set(c, [...(by.get(c) ?? []), v]);
    }
    return by;
  };

  const same = pool(true);
  const any = pool(false);
  const out: CostSuggestion[] = [];
  for (const category of new Set<CostCategory>([...same.keys(), ...any.keys()])) {
    const values = (same.get(category)?.length ?? 0) >= MIN_SAMPLES ? same.get(category)! : any.get(category) ?? [];
    if (values.length < MIN_SAMPLES) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    out.push({
      category,
      amountPerUnit: round2(median(sorted)),
      min: round2(min),
      max: round2(max),
      samples: sorted.length,
      confidence: sorted.length >= 5 && max <= min * 1.5 ? 'high' : sorted.length >= 3 ? 'medium' : 'low',
    });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category));
}
