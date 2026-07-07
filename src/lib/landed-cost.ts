import type { CostCategory } from '@prisma/client';

// Each Incoterm's category set is a superset of the one before it, reflecting
// how much of the shipment cost the seller is responsible for — EXW is
// factory-gate only; DDP means the seller bears everything through customs.
export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'] as const;
export type Incoterm = (typeof INCOTERMS)[number];

const EXW_CATEGORIES: CostCategory[] = ['material', 'conversion', 'packing'];
const FCA_CATEGORIES: CostCategory[] = [...EXW_CATEGORIES, 'inland_freight'];
const FOB_CATEGORIES: CostCategory[] = [...FCA_CATEGORIES, 'cha', 'port'];
const CFR_CATEGORIES: CostCategory[] = [...FOB_CATEGORIES, 'freight'];
const CIF_CATEGORIES: CostCategory[] = [...CFR_CATEGORIES, 'insurance'];
const DAP_CATEGORIES: CostCategory[] = [...CIF_CATEGORIES, 'finance_cost'];
const DDP_CATEGORIES: CostCategory[] = [...DAP_CATEGORIES, 'duties', 'other'];

export const INCOTERM_INCLUDED_CATEGORIES: Record<Incoterm, CostCategory[]> = {
  EXW: EXW_CATEGORIES,
  FCA: FCA_CATEGORIES,
  FOB: FOB_CATEGORIES,
  CFR: CFR_CATEGORIES,
  CIF: CIF_CATEGORIES,
  DAP: DAP_CATEGORIES,
  DDP: DDP_CATEGORIES,
};

export function isIncoterm(value: string): value is Incoterm {
  return (INCOTERMS as readonly string[]).includes(value);
}

/** Categories not seller-borne under the given Incoterm are excluded from landed cost. */
function includedCategoriesFor(incoterm: string): CostCategory[] | null {
  return isIncoterm(incoterm) ? INCOTERM_INCLUDED_CATEGORIES[incoterm] : null;
}

export type LandedCostInput = {
  incoterm: string;
  sellPricePerUnit: number;
  rodtepPct: number;
  lines: { category: CostCategory; amountPerUnit: number }[];
};

export type LandedCostResult = {
  grossCostPerUnit: number;
  rodtepCreditPerUnit: number;
  landedCostPerUnit: number;
  landedMarginPct: number | undefined;
  excludedLines: { category: CostCategory; amountPerUnit: number }[];
};

/** True per-unit landed cost/margin for a quote, honoring which cost categories the given Incoterm makes the seller responsible for. */
export function computeLandedCost(input: LandedCostInput): LandedCostResult {
  const included = includedCategoriesFor(input.incoterm);
  const includedLines = included ? input.lines.filter((l) => included.includes(l.category)) : input.lines;
  const excludedLines = included ? input.lines.filter((l) => !included.includes(l.category)) : [];

  const grossCostPerUnit = parseFloat(includedLines.reduce((sum, l) => sum + l.amountPerUnit, 0).toFixed(2));
  const rodtepCreditPerUnit = parseFloat((grossCostPerUnit * (input.rodtepPct / 100)).toFixed(2));
  const landedCostPerUnit = parseFloat((grossCostPerUnit - rodtepCreditPerUnit).toFixed(2));

  const landedMarginPct = input.sellPricePerUnit > 0
    ? parseFloat((((input.sellPricePerUnit - landedCostPerUnit) / input.sellPricePerUnit) * 100).toFixed(2))
    : undefined;

  return { grossCostPerUnit, rodtepCreditPerUnit, landedCostPerUnit, landedMarginPct, excludedLines };
}
