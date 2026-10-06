import assert from 'node:assert/strict';
import { planReporting } from '../../lib/fx';
import { ageingBucketFor, receivablesAgeing, revenueByMonth, marginBreakdown, orderPipeline, shipmentPerformance, type InvoiceRow, type MarginOrder } from '../../lib/analytics';

/** Report-pack aggregations (pure): `npm run test:analytics`. */

const now = new Date('2026-10-15T12:00:00Z');
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const usd = planReporting(['USD'], {});
const mixed = planReporting(['USD', 'EUR', 'GBP'], { INR: 1, USD: 80, EUR: 90 });

const inv = (o: Partial<InvoiceRow> = {}): InvoiceRow => ({
  total: 1000, balanceDue: 1000, currency: 'USD', status: 'sent', dueDate: d('2026-10-20'), createdAt: d('2026-10-01'), isCreditOrDebitNote: false, ...o,
});

// ── Ageing bucket boundaries ────────────────────────────────────────────────
assert.equal(ageingBucketFor(null, now), 'no_due_date');
assert.equal(ageingBucketFor(d('2026-10-15'), now), 'not_due', 'due today is not overdue');
assert.equal(ageingBucketFor(d('2026-10-14'), now), 'd1_30');
assert.equal(ageingBucketFor(d('2026-09-15'), now), 'd1_30', '30 days');
assert.equal(ageingBucketFor(d('2026-09-14'), now), 'd31_60', '31 days');
assert.equal(ageingBucketFor(d('2026-08-16'), now), 'd31_60', '60 days');
assert.equal(ageingBucketFor(d('2026-08-15'), now), 'd61_90', '61 days');
assert.equal(ageingBucketFor(d('2026-07-17'), now), 'd61_90', '90 days');
assert.equal(ageingBucketFor(d('2026-07-16'), now), 'd90_plus', '91 days');

// ── receivablesAgeing: filters + sums ───────────────────────────────────────
{
  const r = receivablesAgeing([
    inv({ balanceDue: 500, dueDate: d('2026-10-20') }),                  // not due
    inv({ balanceDue: 300, dueDate: d('2026-10-01') }),                  // 14d
    inv({ balanceDue: 200, dueDate: d('2026-06-01') }),                  // 90+
    inv({ balanceDue: 999, status: 'draft' }),                           // not owed yet
    inv({ balanceDue: 999, status: 'void' }),
    inv({ balanceDue: 999, status: 'paid' }),
    inv({ balanceDue: 0 }),                                              // settled
    inv({ balanceDue: 999, isCreditOrDebitNote: true }),                 // notes are not receivables
    inv({ balanceDue: 70, dueDate: null }),
  ], now, usd);
  const by = Object.fromEntries(r.buckets.map((b) => [b.key, b]));
  assert.equal(by.not_due.amount, 500); assert.equal(by.d1_30.amount, 300); assert.equal(by.d90_plus.amount, 200); assert.equal(by.no_due_date.amount, 70);
  assert.equal(r.total, 1070); assert.equal(r.excludedCount, 0);
  assert.deepEqual(r.buckets.map((b) => b.key), ['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'no_due_date'], 'stable bucket order');
}
// multi-currency: converts, and counts what it cannot convert
{
  const r = receivablesAgeing([inv({ balanceDue: 10, currency: 'USD' }), inv({ balanceDue: 10, currency: 'EUR' }), inv({ balanceDue: 10, currency: 'GBP' })], now, mixed);
  assert.equal(r.total, 800 + 900); assert.equal(r.excludedCount, 1);
}

// ── revenueByMonth: window, zero-fill, credit netting, exclusions ───────────
{
  const { points, excludedCount } = revenueByMonth([
    inv({ total: 1000, createdAt: d('2026-10-03') }),
    inv({ total: 400, createdAt: d('2026-10-09'), isCreditOrDebitNote: true, noteKind: 'credit' }),
    inv({ total: 100, createdAt: d('2026-10-09'), isCreditOrDebitNote: true, noteKind: 'debit' }),
    inv({ total: 500, createdAt: d('2026-08-20') }),
    inv({ total: 9999, createdAt: d('2026-10-04'), status: 'draft' }),
    inv({ total: 9999, createdAt: d('2026-10-04'), status: 'void' }),
    inv({ total: 7777, createdAt: d('2025-01-04') }),                      // outside a 3-month window
  ], now, usd, 3);
  assert.deepEqual(points, [{ month: '2026-08', revenue: 500 }, { month: '2026-09', revenue: 0 }, { month: '2026-10', revenue: 700 }]);
  assert.equal(excludedCount, 0);
}
{
  const { points } = revenueByMonth([], now, usd, 12);
  assert.equal(points.length, 12); assert.equal(points[11].month, '2026-10'); assert.equal(points[0].month, '2025-11');
}

// ── marginBreakdown ─────────────────────────────────────────────────────────
const order = (o: Partial<MarginOrder> = {}): MarginOrder => ({
  buyerName: 'Meridian', country: 'Germany', status: 'confirmed', currency: 'USD',
  lines: [{ description: 'Towel', quantity: 100, cost: 6, lineTotal: 1000 }], ...o,
});
{
  const r = marginBreakdown([
    order(),
    order({ buyerName: 'Acme', country: 'USA', lines: [{ description: 'Sheet', quantity: 10, cost: 50, lineTotal: 800 }] }),
    order({ status: 'cancelled' }),                                         // ignored
    order({ lines: [{ description: 'Mystery', quantity: 5, cost: 0, lineTotal: 500 }] }), // no cost → counted, not margin
  ], 'buyer', usd);
  assert.deepEqual(r.rows.map((x) => x.label), ['Meridian', 'Acme'], 'sorted by revenue, highest first');
  const mer = r.rows.find((x) => x.label === 'Meridian')!;
  assert.equal(mer.revenue, 1000); assert.equal(mer.cost, 600); assert.equal(mer.margin, 400); assert.equal(mer.marginPct, 40);
  const acme = r.rows.find((x) => x.label === 'Acme')!;
  assert.equal(acme.revenue, 800); assert.equal(acme.cost, 500); assert.equal(acme.marginPct, 37.5);
  assert.equal(r.linesWithoutCost, 1, 'unknown-cost lines are counted, never treated as free');
}
{
  const r = marginBreakdown([order(), order({ country: 'Germany' }), order({ country: null })], 'country', usd);
  assert.deepEqual(r.rows.map((x) => [x.label, x.orders]), [['Germany', 2], ['Unknown country', 1]]);
  const p = marginBreakdown([order()], 'product', usd);
  assert.equal(p.rows[0].label, 'Towel');
}
{
  const r = marginBreakdown([order({ currency: 'EUR' }), order({ currency: 'GBP' })], 'buyer', mixed);
  assert.equal(r.rows[0].revenue, 90000); assert.equal(r.excludedCount, 1, 'GBP order excluded, not guessed');
}

// ── orderPipeline ───────────────────────────────────────────────────────────
{
  const p = orderPipeline([
    { status: 'confirmed', value: 100, currency: 'USD' }, { status: 'confirmed', value: 50, currency: 'USD' },
    { status: 'shipped', value: 200, currency: 'USD' }, { status: 'delivered', value: 1, currency: 'GBP' },
  ], mixed);
  assert.deepEqual(p.stages.map((s) => s.status), ['confirmed', 'in_production', 'shipped', 'in_transit', 'delivered', 'cancelled']);
  assert.equal(p.stages[0].count, 2); assert.equal(p.stages[0].value, 12000);
  assert.equal(p.stages[4].count, 1); assert.equal(p.stages[4].value, 0); assert.equal(p.excludedCount, 1);
}

// ── shipmentPerformance ─────────────────────────────────────────────────────
{
  const s = shipmentPerformance([
    { plannedAt: d('2026-10-01'), actualAt: d('2026-09-30') },   // early → on time
    { plannedAt: d('2026-10-01'), actualAt: d('2026-10-01') },   // same day → on time
    { plannedAt: d('2026-10-01'), actualAt: d('2026-10-04') },   // 3 days late
    { plannedAt: d('2026-10-01'), actualAt: d('2026-10-06') },   // 5 days late
    { plannedAt: d('2026-10-10'), actualAt: null },              // overdue, open
    { plannedAt: d('2026-10-15'), actualAt: null },              // due today → still upcoming
    { plannedAt: d('2026-11-01'), actualAt: null },              // upcoming
    { plannedAt: null, actualAt: d('2026-10-01') },              // no plan → ignored
  ], now);
  assert.deepEqual([s.onTime, s.late, s.overdueOpen, s.upcoming], [2, 2, 1, 2]);
  assert.equal(s.onTimePct, 50); assert.equal(s.avgDelayDays, 4);
  assert.equal(shipmentPerformance([], now).onTimePct, null);
  assert.equal(shipmentPerformance([{ plannedAt: d('2026-12-01'), actualAt: null }], now).onTimePct, null, 'nothing completed → no rate, not 0%');
}

console.log('✓ analytics: ageing, revenue, margin, pipeline, shipment on-time');
