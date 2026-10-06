// FX (M4). Pure — no DB. Rates are "1 unit of CURRENCY = rateToBase units of the base currency" (INR for
// the India pack). There is no live feed: rates are entered by the tenant, and anything that cannot be
// converted is reported as such rather than guessed — a wrong exchange rate in a cash forecast is worse
// than an honest "no rate for EUR".

export const DEFAULT_BASE_CURRENCY = 'INR';

export type FxRateMap = Record<string, number>;

export type FxSnapshotLike = { currency: string; rateToBase: number; asOf: Date };

const norm = (c: string) => c.trim().toUpperCase();
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Latest-wins rate per currency. The base currency is always 1. Non-positive/non-finite rates are ignored. */
export function latestRates(snapshots: FxSnapshotLike[], baseCurrency = DEFAULT_BASE_CURRENCY): FxRateMap {
  const base = norm(baseCurrency);
  const newest = new Map<string, FxSnapshotLike>();
  for (const s of snapshots) {
    if (!Number.isFinite(s.rateToBase) || s.rateToBase <= 0) continue;
    const c = norm(s.currency);
    const cur = newest.get(c);
    if (!cur || s.asOf > cur.asOf) newest.set(c, s);
  }
  const out: FxRateMap = { [base]: 1 };
  for (const [c, s] of newest) if (c !== base) out[c] = s.rateToBase;
  return out;
}

/** Converts into the base currency, or null when there is no rate for `currency`. */
export function convertToBase(amount: number, currency: string, rates: FxRateMap): number | null {
  const rate = rates[norm(currency)];
  return rate == null ? null : round2(amount * rate);
}

/** Converts between two currencies via the base. Null when either side has no rate. */
export function convertBetween(amount: number, from: string, to: string, rates: FxRateMap): number | null {
  if (norm(from) === norm(to)) return round2(amount);
  const rf = rates[norm(from)];
  const rt = rates[norm(to)];
  if (rf == null || rt == null) return null;
  return round2((amount * rf) / rt);
}

export type ReportingPlan = {
  /** The currency totals are expressed in. */
  reportingCurrency: string;
  /** True when more than one currency is involved and conversion into the base is happening. */
  converted: boolean;
  /** Converts one amount into the reporting currency; null when no rate exists. */
  convert: (amount: number, currency: string) => number | null;
  /** Currencies present in the data that have no rate and therefore are NOT in the totals. */
  unconverted: string[];
};

/**
 * Decides how to report a set of amounts. One currency → report in it as-is (no rate needed, no
 * conversion noise). Several → report in the base currency, converting what has a rate and naming what
 * does not.
 */
export function planReporting(currencies: string[], rates: FxRateMap, baseCurrency = DEFAULT_BASE_CURRENCY): ReportingPlan {
  const present = [...new Set(currencies.map(norm))];
  if (present.length <= 1) {
    const only = present[0] ?? norm(baseCurrency);
    return { reportingCurrency: only, converted: false, convert: (a) => round2(a), unconverted: [] };
  }
  const base = norm(baseCurrency);
  return {
    reportingCurrency: base,
    converted: true,
    convert: (amount, currency) => convertToBase(amount, currency, rates),
    unconverted: present.filter((c) => rates[c] == null),
  };
}

/** Validates a rate entry. Returns an error message, or null when acceptable. */
export function validateRateEntry(currency: string, rateToBase: number, baseCurrency = DEFAULT_BASE_CURRENCY): string | null {
  const c = norm(currency);
  if (!/^[A-Z]{3}$/.test(c)) return 'Currency must be a 3-letter code, e.g. USD.';
  if (c === norm(baseCurrency)) return `${c} is your base currency — its rate is always 1.`;
  if (!Number.isFinite(rateToBase) || rateToBase <= 0) return 'Rate must be a number above 0.';
  return null;
}
