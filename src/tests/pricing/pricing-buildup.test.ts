import assert from 'node:assert/strict';
import {
  DEFAULT_MARGIN_PCT,
  priceFromCostAndMargin,
  marginPctFromCostPrice,
  computeSellPrice,
  marginPctFromCostExpensePrice,
  withDefaultExpenseMargin,
} from '../../lib/pricing-buildup';

/**
 * Shared expense%/margin% price build-up used by quotes and invoices.
 * Pure, no DB: `npm run test:pricing`.
 */

// ── priceFromCostAndMargin: margin-on-price ───────────────────────────────────
assert.equal(priceFromCostAndMargin(80, 20), 100, '80 / (1-0.2) = 100');
assert.equal(priceFromCostAndMargin(80, 0), 80, 'zero margin → cost');
assert.equal(priceFromCostAndMargin(80, 100), 80, '100% margin guarded → cost');
assert.equal(priceFromCostAndMargin(80, 150), 80, '>100% margin guarded → cost');

// ── marginPctFromCostPrice: inverse ───────────────────────────────────────────
assert.equal(marginPctFromCostPrice(80, 100), 20, '(100-80)/100');
assert.equal(marginPctFromCostPrice(80, 0), undefined, 'zero price → undefined');
assert.equal(marginPctFromCostPrice(80, -5), undefined, 'negative price → undefined');

// ── round-trip: price → margin → price is stable ──────────────────────────────
{
  const cost = 123.45;
  const price = priceFromCostAndMargin(cost, 25);
  const margin = marginPctFromCostPrice(cost, price)!;
  assert.equal(priceFromCostAndMargin(cost, margin), price, 'round-trips within rounding');
}

// ── computeSellPrice: expense% then margin% ───────────────────────────────────
assert.equal(computeSellPrice(80, 0, 20), 100);
assert.equal(computeSellPrice(100, 10, 0), 110, 'expense% only');
// 100 * 1.10 = 110 cost-with-expense; /(1-0.2) = 137.5
assert.equal(computeSellPrice(100, 10, 20), 137.5);

assert.equal(marginPctFromCostExpensePrice(100, 10, 137.5), 20, 'implied margin backs out');

// ── withDefaultExpenseMargin: fills missing pct and recomputes ────────────────
{
  const [filled] = withDefaultExpenseMargin([
    { cost: 80, unitPrice: 0, quantity: 2, lineTotal: 0 },
  ]);
  assert.equal(filled.expensePct, 0);
  assert.equal(filled.marginPct, DEFAULT_MARGIN_PCT);
  assert.equal(filled.unitPrice, 100, '80 defaulted to 20% margin');
  assert.equal(filled.lineTotal, 200, 'qty 2 * 100');
}
{
  // Lines with both pct present are left untouched.
  const line = { cost: 80, expensePct: 5, marginPct: 30, unitPrice: 999, quantity: 1, lineTotal: 999 };
  const [same] = withDefaultExpenseMargin([line]);
  assert.equal(same.unitPrice, 999, 'complete line not recomputed');
}
{
  // Lines without a real cost are passed through unchanged.
  const line = { cost: 0, unitPrice: 50, quantity: 1, lineTotal: 50 };
  const [same] = withDefaultExpenseMargin([line]);
  assert.equal(same.unitPrice, 50);
  assert.equal(same.marginPct, undefined);
}

console.log('✓ pricing-buildup: margin-on-price, expense build-up, defaults fill & recompute');
