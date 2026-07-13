import assert from 'node:assert/strict';
import { computeOrderPnl, type OrderPnlInput } from '../../lib/order-pnl';

/**
 * Pins the Sprint-4 wiring: booked snapped expenses reduce the actual margin of an order. Pure function,
 * no DB — run: npx tsx src/tests/order-pnl/expenses.test.ts
 */

function base(): OrderPnlInput {
  return {
    quote: { total: 10000, lines: [{ quantity: 100, cost: 60, unitPrice: 100, lineTotal: 10000 }] },
    costSheet: null,
    invoices: [{ total: 10000, isCreditOrDebitNote: false }],
    incentiveAmounts: [],
    bookedExpenses: [],
  };
}

// Without expenses: actual margin = (10000 - quotedCost 6000) / 10000 = 40%.
{
  const r = computeOrderPnl(base());
  assert.equal(r.bookedExpenses, 0);
  assert.equal(r.actualMarginPct, 40);
}

// With ₹1000 of booked expenses: (10000 - 6000 - 1000) / 10000 = 30%.
{
  const r = computeOrderPnl({ ...base(), bookedExpenses: [400, 600] });
  assert.equal(r.bookedExpenses, 1000);
  assert.equal(r.actualMarginPct, 30);
}

// Expenses are ignored when there's no actual revenue to compute a margin against.
{
  const r = computeOrderPnl({ ...base(), invoices: [], bookedExpenses: [500] });
  assert.equal(r.bookedExpenses, 500);
  assert.equal(r.actualMarginPct, null);
}

console.log('✓ order-pnl: booked expenses reduce actual margin (3 cases pass)');
