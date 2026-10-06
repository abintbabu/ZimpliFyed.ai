// Freight quote comparison (V2). Pure — no DB.
//
// Forwarders quote in different currencies, on different bases and with different validity. To compare them
// fairly every quote is converted to ONE currency and expressed per chargeable unit (CBM for sea LCL, kg for
// air) as well as all-in. A quote that cannot be converted or has expired is kept in the table but never
// ranked — hiding it would mislead; ranking it would be wrong.

import { convertBetween, type FxRateMap } from './fx';

export type FreightMode = 'sea_fcl' | 'sea_lcl' | 'air' | 'road' | 'courier';

export type FreightQuoteRow = {
  id: string;
  forwarderName: string;
  mode: FreightMode;
  currency: string;
  amount: number | null;
  transitDays: number | null;
  validTo: Date | null;
  status: string;
};

/** Air cargo is billed on the greater of actual and volumetric weight (1 CBM ≈ 167 kg, IATA convention). */
export const AIR_VOLUMETRIC_KG_PER_CBM = 167;

export type Chargeable = { unit: 'cbm' | 'kg' | 'shipment'; quantity: number };

/** What a quote is priced per, given the shipment's size. FCL is a flat per-container price. */
export function chargeableBasis(mode: FreightMode, cbm: number | null, weightKg: number | null): Chargeable {
  if (mode === 'sea_lcl') {
    // Sea LCL: greater of CBM and metric tonnes ("W/M").
    const tonnes = weightKg != null ? weightKg / 1000 : 0;
    const q = Math.max(cbm ?? 0, tonnes);
    return q > 0 ? { unit: 'cbm', quantity: Math.round(q * 1000) / 1000 } : { unit: 'shipment', quantity: 1 };
  }
  if (mode === 'air') {
    const vol = cbm != null ? cbm * AIR_VOLUMETRIC_KG_PER_CBM : 0;
    const q = Math.max(weightKg ?? 0, vol);
    return q > 0 ? { unit: 'kg', quantity: Math.round(q * 10) / 10 } : { unit: 'shipment', quantity: 1 };
  }
  return { unit: 'shipment', quantity: 1 };
}

export type ComparedQuote = FreightQuoteRow & {
  /** All-in total in the comparison currency, or null when it could not be converted / has no amount. */
  total: number | null;
  perUnit: number | null;
  unit: Chargeable['unit'];
  expired: boolean;
  rankable: boolean;
  /** 1 = cheapest among rankable quotes. */
  rank: number | null;
  /** Cheapest rankable / fastest rankable. */
  isCheapest: boolean;
  isFastest: boolean;
  problems: string[];
};

export function compareFreightQuotes(input: {
  quotes: FreightQuoteRow[];
  mode: FreightMode;
  cbm: number | null;
  weightKg: number | null;
  currency: string;
  rates: FxRateMap;
  now: Date;
}): { rows: ComparedQuote[]; basis: Chargeable } {
  const basis = chargeableBasis(input.mode, input.cbm, input.weightKg);

  const rows: ComparedQuote[] = input.quotes.map((q) => {
    const problems: string[] = [];
    const expired = q.validTo != null && q.validTo.getTime() < input.now.getTime();
    if (expired) problems.push('Quote has expired — ask the forwarder to re-confirm.');
    if (q.status === 'rejected') problems.push('Rejected.');
    let total: number | null = null;
    if (q.amount == null) problems.push('No price yet.');
    else {
      total = convertBetween(q.amount, q.currency, input.currency, input.rates);
      if (total == null) problems.push(`No exchange rate from ${q.currency.toUpperCase()} to ${input.currency.toUpperCase()}.`);
    }
    const rankable = total != null && !expired && q.status !== 'rejected';
    return {
      ...q, total,
      perUnit: total != null && basis.quantity > 0 ? Math.round((total / basis.quantity + Number.EPSILON) * 100) / 100 : null,
      unit: basis.unit, expired, rankable, rank: null, isCheapest: false, isFastest: false, problems,
    };
  });

  const ranked = rows.filter((r) => r.rankable).sort((a, b) => a.total! - b.total! || (a.transitDays ?? 999) - (b.transitDays ?? 999));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  if (ranked[0]) ranked[0].isCheapest = true;
  const withTransit = ranked.filter((r) => r.transitDays != null);
  if (withTransit.length) {
    const fastest = withTransit.reduce((a, b) => (b.transitDays! < a.transitDays! ? b : a));
    fastest.isFastest = true;
  }
  // Ranked first (cheapest first), then the rest in the order given.
  rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  return { rows, basis };
}
