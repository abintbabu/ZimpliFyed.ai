import assert from 'node:assert/strict';
import { chargeableBasis, compareFreightQuotes, type FreightQuoteRow } from '../../lib/freight-compare';
import { buildScorecard, MIN_ORDERS_FOR_SCORE, type ScorecardPo } from '../../lib/scorecard';
import { delta, balances, validateMovement, lowStock } from '../../lib/stock';
import { billBalance, billStatusFor, validatePayment, openBalances } from '../../lib/payables';

/** Supply-side engines (pure): `npm run test:supply`. */

const d = (s: string) => new Date(`${s}T00:00:00Z`);

// ── Freight: chargeable basis ───────────────────────────────────────────────
assert.deepEqual(chargeableBasis('sea_lcl', 4, 2500), { unit: 'cbm', quantity: 4 }, '4 CBM vs 2.5 t → CBM');
assert.deepEqual(chargeableBasis('sea_lcl', 2, 3200), { unit: 'cbm', quantity: 3.2 }, 'dense cargo is billed by tonne');
assert.deepEqual(chargeableBasis('air', 1, 100), { unit: 'kg', quantity: 167 }, 'volumetric 167 kg beats 100 kg actual');
assert.deepEqual(chargeableBasis('air', 0.2, 100), { unit: 'kg', quantity: 100 });
assert.deepEqual(chargeableBasis('sea_fcl', 30, 20000), { unit: 'shipment', quantity: 1 });
assert.deepEqual(chargeableBasis('sea_lcl', null, null), { unit: 'shipment', quantity: 1 }, 'no size → cannot normalise');

// ── Freight: comparison ─────────────────────────────────────────────────────
{
  const q = (o: Partial<FreightQuoteRow> & { id: string }): FreightQuoteRow => ({ forwarderName: o.id, mode: 'sea_lcl', currency: 'USD', amount: 100, transitDays: 30, validTo: null, status: 'received', ...o });
  const { rows, basis } = compareFreightQuotes({
    quotes: [
      q({ id: 'dear', amount: 900 }),
      q({ id: 'cheap-eur', currency: 'EUR', amount: 500, transitDays: 35 }),     // 500 EUR × 90/80 = 562.5 USD
      q({ id: 'fast', amount: 700, transitDays: 18 }),
      q({ id: 'expired', amount: 100, validTo: d('2026-09-01') }),
      q({ id: 'norate', currency: 'GBP', amount: 50 }),
      q({ id: 'noprice', amount: null }),
      q({ id: 'rejected', amount: 80, status: 'rejected' }),
    ],
    mode: 'sea_lcl', cbm: 5, weightKg: 1000, currency: 'USD', rates: { INR: 1, USD: 80, EUR: 90 }, now: d('2026-10-05'),
  });
  assert.deepEqual(basis, { unit: 'cbm', quantity: 5 });
  assert.deepEqual(rows.slice(0, 3).map((r) => r.id), ['cheap-eur', 'fast', 'dear'], 'ranked quotes first, cheapest first');
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by['cheap-eur'].total, 562.5); assert.equal(by['cheap-eur'].perUnit, 112.5); assert.equal(by['cheap-eur'].rank, 1); assert.equal(by['cheap-eur'].isCheapest, true);
  assert.equal(by.fast.isFastest, true); assert.equal(by['cheap-eur'].isFastest, false);
  for (const id of ['expired', 'norate', 'noprice', 'rejected']) { assert.equal(by[id].rankable, false, `${id} is never ranked`); assert.equal(by[id].rank, null); assert.ok(by[id].problems.length > 0); }
  assert.match(by.expired.problems[0], /expired/); assert.match(by.norate.problems[0], /exchange rate/); assert.equal(by.noprice.total, null);
  assert.equal(rows.length, 7, 'unrankable quotes stay visible');
}
{ // ties on price break by faster transit
  const r = compareFreightQuotes({ quotes: [
    { id: 'a', forwarderName: 'a', mode: 'air', currency: 'USD', amount: 100, transitDays: 5, validTo: null, status: 'received' },
    { id: 'b', forwarderName: 'b', mode: 'air', currency: 'USD', amount: 100, transitDays: 3, validTo: null, status: 'received' },
  ], mode: 'air', cbm: null, weightKg: 50, currency: 'USD', rates: {}, now: d('2026-10-05') });
  assert.equal(r.rows[0].id, 'b'); assert.equal(r.rows[0].perUnit, 2);
}

// ── Scorecard ───────────────────────────────────────────────────────────────
const po = (o: Partial<ScorecardPo> = {}): ScorecardPo => ({ poNumber: 'PO', createdAt: d('2026-01-01'), deliveryDate: d('2026-02-01'), receivedAt: d('2026-02-01'), status: 'received', lines: [{ description: 'Yarn', unitPrice: 100 }], ...o });
{
  const s = buildScorecard([po(), po({ receivedAt: d('2026-01-30') }), po({ receivedAt: d('2026-02-05') }), po({ receivedAt: d('2026-02-09') })], [{ qtyReceived: 1000, qtyRejected: 20 }]);
  assert.equal(s.orders, 4); assert.equal(s.measuredDeliveries, 4); assert.equal(s.onTimePct, 50); assert.equal(s.avgDelayDays, 6, '4 and 8 days late');
  assert.equal(s.rejectionPct, 2); assert.equal(s.enoughData, true);
  assert.equal(s.score, Math.round((50 * 60 + 90 * 40) / 100), '60% on-time weight, 40% quality (2% rejection → 90)');
  assert.equal(s.grade, 'C');
}
{ // too little data → no score
  const s = buildScorecard([po(), po()], [{ qtyReceived: 10, qtyRejected: 0 }]);
  assert.equal(MIN_ORDERS_FOR_SCORE, 3); assert.equal(s.enoughData, false); assert.equal(s.score, null); assert.equal(s.grade, null); assert.equal(s.onTimePct, 100);
}
{ // drafts and cancelled POs don't count; unmeasured POs don't dilute
  const s = buildScorecard([po(), po(), po(), po({ status: 'draft' }), po({ status: 'cancelled' }), po({ deliveryDate: null })], []);
  assert.equal(s.orders, 4); assert.equal(s.measuredDeliveries, 3); assert.equal(s.onTimePct, 100); assert.equal(s.rejectionPct, null); assert.equal(s.score, 100); assert.equal(s.grade, 'A');
}
{ // heavy rejection floors the quality component at 0
  const s = buildScorecard([po(), po(), po()], [{ qtyReceived: 100, qtyRejected: 30 }]);
  assert.equal(s.score, 60, '100% on-time × 60 + 0 quality × 40');
}
{ // price trend: first → latest for repeat purchases
  const s = buildScorecard([po({ createdAt: d('2026-01-01'), lines: [{ description: 'Yarn', unitPrice: 100 }] }), po({ createdAt: d('2026-03-01'), lines: [{ description: ' yarn ', unitPrice: 110 }] }), po({ createdAt: d('2026-02-01'), lines: [{ description: 'Cartons', unitPrice: 5 }] })], []);
  assert.equal(s.priceTrendPct, 10, 'Yarn +10%; Cartons bought once is ignored');
  assert.equal(buildScorecard([po()], []).priceTrendPct, null);
}

// ── Stock ───────────────────────────────────────────────────────────────────
assert.equal(delta('receipt', 5), 5); assert.equal(delta('receipt', -5), 5); assert.equal(delta('issue', 5), -5); assert.equal(delta('issue', -5), -5); assert.equal(delta('adjustment', -3), -3);
{
  const b = balances([{ itemId: 'a', kind: 'receipt', quantity: 100 }, { itemId: 'a', kind: 'issue', quantity: 30 }, { itemId: 'a', kind: 'adjustment', quantity: -2 }, { itemId: 'b', kind: 'receipt', quantity: 0.1 }, { itemId: 'b', kind: 'receipt', quantity: 0.2 }]);
  assert.equal(b.get('a'), 68); assert.equal(b.get('b'), 0.3, 'no float drift');
}
assert.equal(validateMovement(10, 'issue', 10), null, 'issuing everything is fine');
assert.match(validateMovement(10, 'issue', 11)!, /Not enough stock: 10 on hand/);
assert.match(validateMovement(10, 'receipt', 0)!, /non-zero/);
assert.match(validateMovement(10, 'receipt', -4)!, /positive/);
assert.equal(validateMovement(10, 'adjustment', -10), null);
assert.match(validateMovement(10, 'adjustment', -11)!, /Not enough stock/);
{
  const items = [{ id: 'a', reorderLevel: 50 }, { id: 'b', reorderLevel: null }, { id: 'c', reorderLevel: 10 }, { id: 'd', reorderLevel: 0 }];
  const low = lowStock(items, new Map([['a', 20], ['b', 0], ['c', 10], ['d', 0]]));
  assert.deepEqual(low.map((x) => [x.itemId, x.shortBy]), [['a', 30], ['c', 0], ['d', 0]], 'at the level counts as low; no level never flags; unknown balance is 0');
}

// ── Payables ────────────────────────────────────────────────────────────────
assert.equal(billBalance(1000, [{ amount: 250 }, { amount: 250.5 }]), 499.5);
assert.equal(billBalance(1000, [{ amount: 1200 }]), 0, 'never negative');
assert.equal(billStatusFor(1000, []), 'open'); assert.equal(billStatusFor(1000, [{ amount: 1 }]), 'partially_paid'); assert.equal(billStatusFor(1000, [{ amount: 1000 }]), 'paid'); assert.equal(billStatusFor(1000, [{ amount: 999.999 }]), 'paid', 'sub-paisa remainder is paid'); assert.equal(billStatusFor(1000, [], true), 'void');
assert.equal(validatePayment(1000, [{ amount: 400 }], 600, 'partially_paid'), null);
assert.match(validatePayment(1000, [{ amount: 400 }], 600.01, 'partially_paid')!, /more than the 600 still owed/);
assert.match(validatePayment(1000, [], 0, 'open')!, /above 0/); assert.match(validatePayment(1000, [], 5, 'void')!, /void/); assert.match(validatePayment(1000, [{ amount: 1000 }], 5, 'paid')!, /already fully paid/);
{
  const o = openBalances([
    { total: 1000, currency: 'INR', dueDate: d('2026-10-01'), payments: [{ amount: 400 }], status: 'partially_paid' },
    { total: 500, currency: 'USD', dueDate: null, payments: [], status: 'open' },
    { total: 300, currency: 'INR', dueDate: null, payments: [{ amount: 300 }], status: 'paid' },
    { total: 300, currency: 'INR', dueDate: null, payments: [], status: 'void' },
  ]);
  assert.deepEqual(o.map((x) => [x.currency, x.balance]), [['INR', 600], ['USD', 500]]);
}

console.log('✓ supply: freight compare, scorecard, stock balances, payables');
