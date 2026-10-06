import assert from 'node:assert/strict';
import { cartonCbm, validatePackingEntries, summarizePacking, type PackingEntryInput } from '../../lib/packing';

/** Carton packing arithmetic (pure): `npm run test:packing`. */

const e = (o: Partial<PackingEntryInput> = {}): PackingEntryInput => ({
  cartonCount: 10, qtyPerCarton: 50, netWeightKg: 18, grossWeightKg: 20, lengthCm: 60, widthCm: 40, heightCm: 40, ...o,
});

// CBM: 60×40×40 cm = 0.096 m³ per carton
assert.equal(cartonCbm(60, 40, 40), 0.096);
assert.equal(cartonCbm(100, 100, 100), 1);

// Summary: ranges are sequential across rows, totals derive from per-carton inputs
{
  const { rows, totals } = summarizePacking([e(), e({ cartonCount: 1, qtyPerCarton: 30, netWeightKg: 9, grossWeightKg: 10 }), e({ cartonCount: 5 })]);
  assert.deepEqual(rows.map((x) => x.cartonRange), ['1-10', '11', '12-16'], 'a single carton prints as "11", not "11-11"');
  assert.equal(rows[0].totalQty, 500);
  assert.equal(rows[0].totalGrossKg, 200);
  assert.equal(rows[0].totalCbm, 0.96);
  assert.equal(totals.cartons, 16);
  assert.equal(totals.quantity, 500 + 30 + 250);
  assert.equal(totals.grossWeightKg, 200 + 10 + 100);
  assert.equal(totals.netWeightKg, 180 + 9 + 90);
  assert.equal(totals.cbm, 0.96 + 0.096 + 0.48);
}

// Totals use unrounded per-carton volume (no compounding of the 4dp per-carton figure)
{
  const { rows } = summarizePacking([e({ cartonCount: 1000, lengthCm: 33, widthCm: 33, heightCm: 33 })]);
  assert.equal(rows[0].totalCbm, 35.937, '1000 × 0.035937 m³, not 1000 × the rounded 0.0359');
}

// Empty set
assert.deepEqual(summarizePacking([]).totals, { cartons: 0, quantity: 0, netWeightKg: 0, grossWeightKg: 0, cbm: 0 });

// Validation
validatePackingEntries([e()]);
assert.throws(() => validatePackingEntries([e({ cartonCount: 0 })]), /carton count/);
assert.throws(() => validatePackingEntries([e({ cartonCount: 2.5 })]), /whole number/);
assert.throws(() => validatePackingEntries([e({ qtyPerCarton: 0 })]), /quantity per carton/);
assert.throws(() => validatePackingEntries([e({ netWeightKg: 0 })]), /weight/);
assert.throws(() => validatePackingEntries([e({ netWeightKg: 21, grossWeightKg: 20 })]), /gross weight .* cannot be less than net/);
assert.throws(() => validatePackingEntries([e({ heightCm: 0 })]), /dimensions/);
assert.throws(() => validatePackingEntries([e(), e({ cartonCount: -1 })]), /Packing row 2/);
validatePackingEntries([e({ netWeightKg: 20, grossWeightKg: 20 })]); // equal is allowed

console.log('✓ packing: CBM, carton ranges, totals, validation');
