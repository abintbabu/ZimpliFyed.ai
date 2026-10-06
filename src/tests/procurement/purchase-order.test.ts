import assert from 'node:assert/strict';
import { canTransitionPo, nextPoStatuses, isPoEditable, normalizePoLines, poTotal, poLineFromAward, defaultDeliveryDate, type PoStatus } from '../../lib/purchase-order';

/** Purchase-order rules (pure): `npm run test:po`. */

// Status machine
assert.equal(canTransitionPo('draft', 'issued'), true);
assert.equal(canTransitionPo('draft', 'received'), false, 'cannot receive goods on a PO that was never issued');
assert.equal(canTransitionPo('issued', 'acknowledged'), true);
assert.equal(canTransitionPo('issued', 'received'), true, 'vendors that never acknowledge can still deliver');
assert.equal(canTransitionPo('acknowledged', 'draft'), false, 'no walking back to draft');
for (const terminal of ['received', 'cancelled'] as PoStatus[]) {
  assert.deepEqual(nextPoStatuses(terminal), [], `${terminal} is terminal`);
}
assert.equal(isPoEditable('draft'), true);
for (const s of ['issued', 'acknowledged', 'received', 'cancelled'] as PoStatus[]) assert.equal(isPoEditable(s), false, `${s} must be locked`);

// Lines
{
  const lines = normalizePoLines([
    { description: '  Cotton yarn 30s ', sku: ' Y30 ', quantity: 100, uom: ' kg ', unitPrice: 2.505 },
    { description: '', quantity: 5, unitPrice: 5 },
    { description: 'Packing carton', quantity: 40, unitPrice: 0 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].description, 'Cotton yarn 30s'); assert.equal(lines[0].sku, 'Y30'); assert.equal(lines[0].uom, 'kg');
  assert.equal(lines[0].lineTotal, 250.5); assert.deepEqual(lines.map((l) => l.sortOrder), [0, 1]);
  assert.equal(poTotal(lines), 250.5);
}
assert.throws(() => normalizePoLines([{ description: 'x', quantity: 0, unitPrice: 1 }]), /quantity/);
assert.throws(() => normalizePoLines([{ description: 'x', quantity: 1, unitPrice: -1 }]), /negative/);
assert.equal(poTotal([]), 0);

// From an award
{
  const a = poLineFromAward({ title: 'Cotton yarn', description: '30s combed', quantity: 500, unit: 'kg' }, { rate: 3.2, moqPieces: 100 });
  assert.equal(a.line.quantity, 500); assert.equal(a.line.unitPrice, 3.2); assert.equal(a.line.uom, 'kg'); assert.equal(a.line.description, 'Cotton yarn — 30s combed'); assert.equal(a.quantityAssumed, false);
  const b = poLineFromAward({ title: 'Cotton yarn', description: null, quantity: null, unit: null }, { rate: 3.2, moqPieces: 250 });
  assert.equal(b.line.quantity, 250, 'falls back to the vendor MOQ'); assert.equal(b.quantityAssumed, true); assert.equal(b.line.description, 'Cotton yarn');
  const c = poLineFromAward({ title: 'T', description: null, quantity: 0, unit: null }, { rate: 1, moqPieces: null });
  assert.equal(c.line.quantity, 1); assert.equal(c.quantityAssumed, true);
}

// Delivery date
assert.equal(defaultDeliveryDate(new Date('2026-10-05T23:00:00Z'), 30)!.toISOString(), '2026-11-04T00:00:00.000Z');
assert.equal(defaultDeliveryDate(new Date('2026-12-20T00:00:00Z'), 15)!.toISOString(), '2027-01-04T00:00:00.000Z', 'crosses a year boundary');
assert.equal(defaultDeliveryDate(new Date(), null), null);
assert.equal(defaultDeliveryDate(new Date(), 0), null);

console.log('✓ purchase-order: status machine, lines, award seeding, delivery date');
