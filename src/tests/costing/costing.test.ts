import assert from 'node:assert/strict';
import { computeLandedCost, priceForTargetMargin, INCOTERM_INCLUDED_CATEGORIES } from '../../lib/landed-cost';
import { effectiveMarginFloor, effectiveDefaultMargin, MARGIN_FLOOR_PCT, DEFAULT_MARGIN_PCT, withDefaultExpenseMargin } from '../../lib/pricing-buildup';
import { suggestCostsFromHistory, type HistoricSheet } from '../../lib/cost-history';

/** Costing additions (pure): `npm run test:costing`. */

// New cost heads land at the right Incoterm
assert.ok(INCOTERM_INCLUDED_CATEGORIES.EXW.includes('commission'), 'agent commission is the seller\'s at every term');
assert.ok(!INCOTERM_INCLUDED_CATEGORIES.EXW.includes('documentation'));
assert.ok(!INCOTERM_INCLUDED_CATEGORIES.FCA.includes('bank_charges'));
for (const t of ['FOB', 'CFR', 'CIF', 'DAP', 'DDP'] as const) {
  assert.ok(INCOTERM_INCLUDED_CATEGORIES[t].includes('documentation') && INCOTERM_INCLUDED_CATEGORIES[t].includes('bank_charges'), `${t} carries documentation + bank charges`);
}
{
  const r = computeLandedCost({ incoterm: 'EXW', sellPricePerUnit: 10, rodtepPct: 0, lines: [
    { category: 'material', amountPerUnit: 5 }, { category: 'commission', amountPerUnit: 0.5 }, { category: 'documentation', amountPerUnit: 0.3 },
  ] });
  assert.equal(r.grossCostPerUnit, 5.5, 'EXW counts commission, not documentation');
  assert.deepEqual(r.excludedLines.map((l) => l.category), ['documentation']);
  assert.equal(r.breakEvenPricePerUnit, r.landedCostPerUnit, 'break-even is the landed cost');
}

// Target price
assert.equal(priceForTargetMargin(80, 20), 100);
assert.equal(priceForTargetMargin(90, 10), 100);
assert.equal(priceForTargetMargin(50, 0), 50);
assert.equal(priceForTargetMargin(50, 100), null);
assert.equal(priceForTargetMargin(50, -5), null);

// Buyer margin policy
assert.equal(effectiveMarginFloor(null), MARGIN_FLOOR_PCT);
assert.equal(effectiveMarginFloor(undefined), MARGIN_FLOOR_PCT);
assert.equal(effectiveMarginFloor(5), 5, 'a strategic account may be thinner');
assert.equal(effectiveMarginFloor(25), 25, 'a risky account may be held higher');
assert.equal(effectiveMarginFloor(0), 0);
assert.equal(effectiveMarginFloor(100), MARGIN_FLOOR_PCT, 'nonsense policy falls back');
assert.equal(effectiveMarginFloor(-3), MARGIN_FLOOR_PCT);
assert.equal(effectiveDefaultMargin(35), 35);
assert.equal(effectiveDefaultMargin(null), DEFAULT_MARGIN_PCT);
{
  const [line] = withDefaultExpenseMargin([{ cost: 80, unitPrice: 0, quantity: 10, lineTotal: 0 }], 20);
  assert.equal(line.marginPct, 20); assert.equal(line.unitPrice, 100);
  const [t] = withDefaultExpenseMargin([{ cost: 70, unitPrice: 0, quantity: 10, lineTotal: 0 }], 30);
  assert.equal(t.marginPct, 30); assert.equal(t.unitPrice, 100, 'buyer target margin drives the default');
}

// Cost history
const d = (n: number) => new Date(2026, 0, n);
const sheet = (id: string, incoterm: string, day: number, lines: HistoricSheet['lines'], currency = 'USD'): HistoricSheet => ({ quoteId: id, incoterm, currency, createdAt: d(day), lines });
{
  const h = [
    sheet('a', 'FOB', 1, [{ category: 'packing', amountPerUnit: 0.2 }, { category: 'port', amountPerUnit: 0.1 }]),
    sheet('b', 'FOB', 2, [{ category: 'packing', amountPerUnit: 0.3 }, { category: 'port', amountPerUnit: 0.12 }]),
    sheet('c', 'FOB', 3, [{ category: 'packing', amountPerUnit: 0.25 }]),
    sheet('d', 'CIF', 4, [{ category: 'freight', amountPerUnit: 0.8 }]),
    sheet('e', 'CIF', 5, [{ category: 'freight', amountPerUnit: 1.0 }]),
    sheet('x', 'FOB', 6, [{ category: 'packing', amountPerUnit: 99 }], 'EUR'),    // other currency → ignored
    sheet('z', 'FOB', 7, [{ category: 'packing', amountPerUnit: 0 }]),            // zero = not entered
  ];
  const s = suggestCostsFromHistory(h, { incoterm: 'FOB', currency: 'usd' });
  const by = Object.fromEntries(s.map((x) => [x.category, x]));
  assert.equal(by.packing.amountPerUnit, 0.25); assert.equal(by.packing.samples, 3); assert.equal(by.packing.min, 0.2); assert.equal(by.packing.max, 0.3); assert.equal(by.packing.confidence, 'medium');
  assert.equal(by.port.amountPerUnit, 0.11, 'even count → mean of the middle two'); assert.equal(by.port.confidence, 'low');
  assert.equal(by.freight.amountPerUnit, 0.9, 'a FOB sheet may borrow freight from CIF history when there is none of its own');
  assert.ok(!('other' in by));
  // excluding the sheet being edited
  assert.equal(suggestCostsFromHistory(h, { incoterm: 'FOB', currency: 'USD' }, 'a').find((x) => x.category === 'packing')!.samples, 2);
}
// too little history → no suggestion
assert.deepEqual(suggestCostsFromHistory([sheet('a', 'FOB', 1, [{ category: 'packing', amountPerUnit: 1 }])], { incoterm: 'FOB', currency: 'USD' }), []);
// same-term preferred when it has enough samples
{
  const h = [
    sheet('1', 'FOB', 1, [{ category: 'packing', amountPerUnit: 1 }]), sheet('2', 'FOB', 2, [{ category: 'packing', amountPerUnit: 1.2 }]),
    sheet('3', 'CIF', 3, [{ category: 'packing', amountPerUnit: 9 }]),
  ];
  assert.equal(suggestCostsFromHistory(h, { incoterm: 'FOB', currency: 'USD' })[0].amountPerUnit, 1.1, 'CIF outlier ignored');
}
// duplicates within a sheet are summed; high confidence needs 5 tight samples
{
  const h = Array.from({ length: 5 }, (_, i) => sheet(`s${i}`, 'FOB', i + 1, [{ category: 'port', amountPerUnit: 0.05 }, { category: 'port', amountPerUnit: 0.05 + i * 0.002 }]));
  const [p] = suggestCostsFromHistory(h, { incoterm: 'FOB', currency: 'USD' });
  assert.equal(p.samples, 5); assert.equal(p.confidence, 'high'); assert.ok(p.amountPerUnit >= 0.1 && p.amountPerUnit <= 0.11);
}

console.log('✓ costing: new heads, target price, buyer margin policy, history suggestions');
