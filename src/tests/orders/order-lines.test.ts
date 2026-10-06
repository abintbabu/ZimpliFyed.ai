import assert from 'node:assert/strict';
import { normalizeOrderLines, summarizeOrderLines } from '../../lib/order-lines';

/** Order line helpers (pure): `npm run test:order-lines`. */

// Blank rows dropped, totals rounded, HS code stripped of dots/spaces, order preserved.
{
  const lines = normalizeOrderLines([
    { description: '  Cotton towel  ', quantity: 3, unitPrice: 1.115, hsCode: '6302 60.00', uom: ' pcs ' },
    { description: '   ', quantity: 5, unitPrice: 9 },
    { description: 'Bed sheet', quantity: 10, unitPrice: 4 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].description, 'Cotton towel');
  assert.equal(lines[0].hsCode, '63026000');
  assert.equal(lines[0].uom, 'pcs');
  assert.equal(lines[0].lineTotal, 3.35, '3 × 1.115 rounds to 2dp');
  assert.deepEqual(lines.map((l) => l.sortOrder), [0, 1]);
}

// Validation
assert.throws(() => normalizeOrderLines([{ description: 'x', quantity: 0, unitPrice: 1 }]), /quantity/);
assert.throws(() => normalizeOrderLines([{ description: 'x', quantity: -2, unitPrice: 1 }]), /quantity/);
assert.throws(() => normalizeOrderLines([{ description: 'x', quantity: 1, unitPrice: -1 }]), /negative/);
assert.throws(() => normalizeOrderLines([{ description: 'x', quantity: NaN, unitPrice: 1 }]), /quantity/);
assert.equal(normalizeOrderLines([{ description: 'free sample', quantity: 1, unitPrice: 0 }])[0].lineTotal, 0, 'zero price is allowed');

// Summary: header-compatible product string and uom handling
{
  const one = summarizeOrderLines(normalizeOrderLines([{ description: 'Towel', quantity: 2, unitPrice: 5, uom: 'pcs' }]));
  assert.equal(one.productSummary, 'Towel');
  assert.equal(one.uom, 'pcs');
  assert.equal(one.total, 10);

  const mixed = summarizeOrderLines(normalizeOrderLines([
    { description: 'Towel', quantity: 2, unitPrice: 5, uom: 'pcs' },
    { description: 'Yarn', quantity: 100, unitPrice: 1, uom: 'kg' },
  ]));
  assert.equal(mixed.productSummary, 'Towel +1 more');
  assert.equal(mixed.uom, null, 'mixed units → no single uom');
  assert.equal(mixed.total, 110);
  assert.equal(mixed.totalQuantity, 102);

  const none = summarizeOrderLines([]);
  assert.equal(none.productSummary, null);
  assert.equal(none.total, 0);
}

console.log('✓ order-lines: normalise, validate, summarise');
