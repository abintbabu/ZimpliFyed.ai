// Pulling an accepted forwarder quote into an order's cost sheet (M5). Pure — no DB.
//
// A freight quote is priced per SHIPMENT, but a shipment can consolidate several orders and a cost sheet is
// per quote, per unit. So the shipment's freight is split across its orders pro-rata by order value
// (largest-remainder rounding, so the shares sum to exactly the quoted amount), converted into the cost
// sheet's currency, then divided by the order's quantity.

import { convertBetween, type FxRateMap } from './fx';

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);

/** Splits `total` across parts by `value`. Shares sum to exactly `total`; zero total value → equal split. */
export function allocateByValue(total: number, parts: { id: string; value: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  if (parts.length === 0) return out;

  const totalCents = cents(total);
  const weights = parts.map((p) => (p.value > 0 ? p.value : 0));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const raw = parts.map((_, i) => (weightSum > 0 ? (totalCents * weights[i]) / weightSum : totalCents / parts.length));

  const floors = raw.map(Math.floor);
  let remainder = totalCents - floors.reduce((s, f) => s + f, 0);
  // Hand the leftover cents to the largest fractional parts first (stable on ties by position).
  const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  parts.forEach((p, i) => out.set(p.id, floors[i] / 100));
  return out;
}

export type AcceptedFreight = {
  shipmentNumber: string;
  amount: number;
  currency: string;
  forwarderName: string;
  /** Every order on the shipment (including this one) with the value used to split the freight. */
  orders: { orderId: string; value: number }[];
};

export type FreightSuggestion = {
  /** Freight per unit in `targetCurrency`, 2dp. Null when nothing could be computed. */
  perUnit: number | null;
  targetCurrency: string;
  /** This order's total share across shipments, in `targetCurrency`. */
  totalShare: number;
  sources: { shipmentNumber: string; forwarderName: string; share: number; quoted: string }[];
  /** Reasons part or all of the freight could not be included. */
  problems: string[];
};

export function suggestFreightPerUnit(input: {
  orderId: string;
  quantity: number;
  targetCurrency: string;
  rates: FxRateMap;
  shipments: AcceptedFreight[];
}): FreightSuggestion {
  const { orderId, quantity, targetCurrency, rates } = input;
  const problems: string[] = [];
  const sources: FreightSuggestion['sources'] = [];
  let totalShare = 0;

  if (input.shipments.length === 0) {
    return { perUnit: null, targetCurrency, totalShare: 0, sources, problems: ['No shipment for this order has an accepted freight quote yet.'] };
  }

  for (const s of input.shipments) {
    if (!s.orders.some((o) => o.orderId === orderId)) continue;
    const share = allocateByValue(s.amount, s.orders.map((o) => ({ id: o.orderId, value: o.value }))).get(orderId) ?? 0;
    const converted = convertBetween(share, s.currency, targetCurrency, rates);
    if (converted == null) {
      problems.push(`Shipment ${s.shipmentNumber} is quoted in ${s.currency.toUpperCase()} but there is no exchange rate to ${targetCurrency.toUpperCase()} — add one in Settings → Exchange rates.`);
      continue;
    }
    totalShare += converted;
    sources.push({ shipmentNumber: s.shipmentNumber, forwarderName: s.forwarderName, share: converted, quoted: `${s.currency.toUpperCase()} ${s.amount}` });
  }

  totalShare = Math.round((totalShare + Number.EPSILON) * 100) / 100;
  if (!(quantity > 0)) {
    problems.push('The order has no quantity, so freight cannot be expressed per unit.');
    return { perUnit: null, targetCurrency, totalShare, sources, problems };
  }
  if (sources.length === 0) return { perUnit: null, targetCurrency, totalShare, sources, problems };

  return { perUnit: Math.round((totalShare / quantity + Number.EPSILON) * 100) / 100, targetCurrency, totalShare, sources, problems };
}
