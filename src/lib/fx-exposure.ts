// FX exposure (V2). Pure — no DB. For each foreign currency: what customers owe you minus what you owe
// suppliers, valued in the base currency at the saved rate, plus how much a move in the rate changes that.
// A currency without a rate is listed as unvalued, never guessed.

import { convertToBase, type FxRateMap } from './fx';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type ExposureRow = {
  currency: string;
  receivable: number;
  payable: number;
  /** receivable − payable, in the foreign currency. Positive = long (you gain if it strengthens). */
  net: number;
  /** Net valued in the base currency at the saved rate; null when there is no rate. */
  netBase: number | null;
  /** Change in base-currency value for a 5% and 10% adverse move (the weaker-currency direction for a long position). */
  adverse5: number | null;
  adverse10: number | null;
};

export function fxExposure(input: {
  receivables: { currency: string; amount: number }[];
  payables: { currency: string; amount: number }[];
  rates: FxRateMap;
  baseCurrency: string;
}): { rows: ExposureRow[]; totalNetBase: number; unvalued: string[] } {
  const base = input.baseCurrency.toUpperCase();
  const acc = new Map<string, { rec: number; pay: number }>();
  for (const r of input.receivables) { const c = r.currency.toUpperCase(); if (c !== base) acc.set(c, { rec: (acc.get(c)?.rec ?? 0) + r.amount, pay: acc.get(c)?.pay ?? 0 }); }
  for (const p of input.payables) { const c = p.currency.toUpperCase(); if (c !== base) acc.set(c, { rec: acc.get(c)?.rec ?? 0, pay: (acc.get(c)?.pay ?? 0) + p.amount }); }

  const rows: ExposureRow[] = [...acc.entries()].map(([currency, a]) => {
    const net = r2(a.rec - a.pay);
    const netBase = convertToBase(net, currency, input.rates);
    // A long position loses when the foreign currency weakens; a short position loses when it strengthens.
    const loss = (pct: number) => (netBase == null ? null : r2(-Math.abs(netBase) * pct));
    return { currency, receivable: r2(a.rec), payable: r2(a.pay), net, netBase, adverse5: loss(0.05), adverse10: loss(0.1) };
  }).sort((a, b) => Math.abs(b.netBase ?? 0) - Math.abs(a.netBase ?? 0) || a.currency.localeCompare(b.currency));

  return {
    rows,
    totalNetBase: r2(rows.reduce((s, r) => s + (r.netBase ?? 0), 0)),
    unvalued: rows.filter((r) => r.netBase == null).map((r) => r.currency),
  };
}
