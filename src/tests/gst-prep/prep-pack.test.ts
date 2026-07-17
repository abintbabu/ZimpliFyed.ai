import assert from 'node:assert/strict';
import { buildGstPrepPack, periodBounds, type PrepExpense, type PrepInvoice } from '../../lib/gst-prep';

/**
 * Pins the GST filing-prep aggregation: only reviewed/booked, ITC-eligible expenses count toward input credit;
 * everything else is excluded but tallied; exports net credit/debit notes by currency. Pure — no DB.
 * Run: npx tsx src/tests/gst-prep/prep-pack.test.ts
 */

function exp(over: Partial<PrepExpense>): PrepExpense {
  return {
    id: Math.random().toString(36).slice(2),
    status: 'approved',
    gstHead: 'Freight & Logistics',
    itcEligible: true,
    amount: 1000,
    currency: 'INR',
    vendorName: 'Acme',
    expenseDate: new Date('2026-06-15'),
    ...over,
  };
}

// ITC counts only booked (approved/auto_posted) + itcEligible expenses.
{
  const expenses: PrepExpense[] = [
    exp({ status: 'approved', itcEligible: true, amount: 1000, gstHead: 'Freight & Logistics' }),
    exp({ status: 'auto_posted', itcEligible: true, amount: 500, gstHead: 'Packaging Materials' }),
    exp({ status: 'approved', itcEligible: false, amount: 999 }), // not eligible → excluded
    exp({ status: 'pending_review', itcEligible: true, amount: 777 }), // unreviewed → excluded + pending
    exp({ status: 'rejected', itcEligible: true, amount: 123 }), // rejected → excluded
  ];
  const pack = buildGstPrepPack('2026-06', expenses, []);
  assert.equal(pack.input.itcEligibleCount, 2);
  assert.equal(pack.input.itcEligibleTotal, 1500);
  assert.equal(pack.input.excludedCount, 3);
  assert.equal(pack.input.pendingReviewCount, 1);
  // Highest-total head first.
  assert.equal(pack.input.byHead[0].gstHead, 'Freight & Logistics');
  assert.equal(pack.input.byHead[0].total, 1000);
}

// Null gstHead on an eligible expense falls back to "Other".
{
  const pack = buildGstPrepPack('2026-06', [exp({ gstHead: null, amount: 200 })], []);
  assert.equal(pack.input.byHead[0].gstHead, 'Other');
  assert.equal(pack.input.byHead[0].total, 200);
}

// Outward turnover groups by currency and nets credit/debit notes.
{
  const invoices: PrepInvoice[] = [
    { id: 'a', currency: 'USD', total: 10000, isCreditOrDebitNote: false },
    { id: 'b', currency: 'USD', total: 1000, isCreditOrDebitNote: true }, // credit note subtracts
    { id: 'c', currency: 'EUR', total: 5000, isCreditOrDebitNote: false },
  ];
  const pack = buildGstPrepPack('2026-06', [], invoices);
  assert.equal(pack.outward.invoiceCount, 3);
  const usd = pack.outward.byCurrency.find((c) => c.currency === 'USD')!;
  assert.equal(usd.total, 9000);
  assert.equal(usd.count, 2);
}

// periodBounds yields a half-open UTC month and rejects garbage.
{
  const { start, end } = periodBounds('2026-06');
  assert.equal(start.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(end.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.throws(() => periodBounds('2026-13'));
  assert.throws(() => periodBounds('nope'));
}

console.log('gst-prep prep-pack: all assertions passed');
