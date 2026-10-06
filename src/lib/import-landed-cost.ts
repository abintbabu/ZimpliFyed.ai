// Import landed cost (V3). Pure — no DB. The mirror of the export costing engine: what an imported good truly
// costs once customs duty and clearance are in, allocated to each line so inventory carries the real figure.
//
// Customs rates (BCD, SWS, IGST) and the notional landing charge are INPUTS the importer takes from the tariff
// and the bill of entry — this file hard-codes no tariff. IGST paid on import is normally creditable, so it is
// shown but kept OUT of the cost. Verify every figure with your CHA before filing; this is a costing aid, not an
// assessment.

import { allocateByValue } from './freight-allocation';

export type ImportLine = {
  description: string;
  quantity: number;
  /** Invoice unit price in the entry's foreign currency (FOB unless the invoice says otherwise). */
  unitPrice: number;
  bcdPct: number;
  swsPct: number;
  igstPct: number;
  otherDutyPct?: number;
};

export type ImportEntryInput = {
  currency: string;
  /** Customs-notified rate: 1 unit of `currency` = this many INR. */
  exchangeRate: number;
  freightInr: number;
  insuranceInr: number;
  portInr?: number;
  chaInr?: number;
  transportInr?: number;
  warehousingInr?: number;
  otherInr?: number;
  /**
   * Notional landing charge as a % of CIF added to the assessable value (a customs valuation convention).
   * Not an actual cost, so it raises duty but is not part of landed cost. Default 1; set 0 to disable.
   */
  landingChargePct?: number;
  lines: ImportLine[];
};

export type ImportLineResult = {
  description: string;
  quantity: number;
  fobInr: number;
  freightInr: number;
  insuranceInr: number;
  landingChargeInr: number;
  assessableValue: number;
  bcd: number;
  sws: number;
  otherDuty: number;
  igst: number;
  /** Post-import costs (port, CHA, transport, warehousing, other) apportioned to this line. */
  clearanceInr: number;
  /** Cost carried into inventory: goods + freight + insurance + duties + clearance. Excludes IGST and landing charge. */
  landedCost: number;
  landedCostPerUnit: number;
};

export type ImportCostResult = {
  lines: ImportLineResult[];
  totals: { fobInr: number; assessableValue: number; duties: number; igst: number; clearanceInr: number; landedCost: number; /** landed cost ÷ goods value; 1.0 = no uplift. */ uplift: number };
  warnings: string[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

export function computeImportLandedCost(e: ImportEntryInput): ImportCostResult {
  if (!(e.exchangeRate > 0)) throw new Error('Enter the customs exchange rate (INR per 1 unit of the invoice currency).');
  if (e.lines.length === 0) throw new Error('Add at least one line.');
  for (const [i, l] of e.lines.entries()) {
    if (!(l.quantity > 0)) throw new Error(`Line ${i + 1}: quantity must be above 0.`);
    if (!(l.unitPrice >= 0)) throw new Error(`Line ${i + 1}: unit price cannot be negative.`);
    for (const [k, v] of [['BCD', l.bcdPct], ['SWS', l.swsPct], ['IGST', l.igstPct], ['other duty', l.otherDutyPct ?? 0]] as const) {
      if (!(v >= 0 && v <= 300)) throw new Error(`Line ${i + 1}: ${k} % looks wrong (${v}).`);
    }
  }

  const landingPct = e.landingChargePct ?? 1;
  const fob = e.lines.map((l) => l.quantity * l.unitPrice * e.exchangeRate);
  const parts = fob.map((v, i) => ({ id: String(i), value: v }));
  const freight = allocateByValue(e.freightInr, parts);
  const insurance = allocateByValue(e.insuranceInr, parts);

  const assessables = e.lines.map((l, i) => {
    const cif = fob[i] + (freight.get(String(i)) ?? 0) + (insurance.get(String(i)) ?? 0);
    const landing = (cif * landingPct) / 100;
    return { cif, landing, av: cif + landing };
  });
  const post = (e.portInr ?? 0) + (e.chaInr ?? 0) + (e.transportInr ?? 0) + (e.warehousingInr ?? 0) + (e.otherInr ?? 0);
  const clearance = allocateByValue(post, e.lines.map((_, i) => ({ id: String(i), value: assessables[i].av })));

  const lines: ImportLineResult[] = e.lines.map((l, i) => {
    const { av, landing } = assessables[i];
    const bcd = (av * l.bcdPct) / 100;
    const sws = (bcd * l.swsPct) / 100;
    const other = (av * (l.otherDutyPct ?? 0)) / 100;
    const igst = ((av + bcd + sws + other) * l.igstPct) / 100;
    const fr = freight.get(String(i)) ?? 0, ins = insurance.get(String(i)) ?? 0, cl = clearance.get(String(i)) ?? 0;
    const landed = fob[i] + fr + ins + bcd + sws + other + cl;
    return {
      description: l.description, quantity: l.quantity,
      fobInr: r2(fob[i]), freightInr: r2(fr), insuranceInr: r2(ins), landingChargeInr: r2(landing), assessableValue: r2(av),
      bcd: r2(bcd), sws: r2(sws), otherDuty: r2(other), igst: r2(igst), clearanceInr: r2(cl),
      landedCost: r2(landed), landedCostPerUnit: r2(landed / l.quantity),
    };
  });

  const sum = (f: (l: ImportLineResult) => number) => r2(lines.reduce((s, l) => s + f(l), 0));
  const fobTotal = sum((l) => l.fobInr);
  const totals = {
    fobInr: fobTotal,
    assessableValue: sum((l) => l.assessableValue),
    duties: sum((l) => l.bcd + l.sws + l.otherDuty),
    igst: sum((l) => l.igst),
    clearanceInr: sum((l) => l.clearanceInr),
    landedCost: sum((l) => l.landedCost),
    uplift: fobTotal > 0 ? r4(sum((l) => l.landedCost) / fobTotal) : 0,
  };

  const warnings: string[] = ['Verify rates, valuation and exchange rate with your CHA — this is a costing aid, not an assessment.'];
  if (e.lines.every((l) => l.bcdPct === 0 && l.swsPct === 0 && (l.otherDutyPct ?? 0) === 0)) warnings.push('No customs duty entered on any line — if the goods are dutiable the landed cost is understated.');
  if (e.lines.some((l) => l.igstPct === 0)) warnings.push('A line has 0% IGST — confirm the goods are exempt.');
  if (e.freightInr === 0 && e.insuranceInr === 0) warnings.push('No freight or insurance entered — the assessable value is the invoice value only.');
  warnings.push('IGST is shown separately and excluded from landed cost, on the usual basis that it is creditable as input tax.');
  return { lines, totals, warnings };
}
