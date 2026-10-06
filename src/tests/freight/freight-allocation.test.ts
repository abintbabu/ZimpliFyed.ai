import assert from 'node:assert/strict';
import { allocateByValue, suggestFreightPerUnit } from '../../lib/freight-allocation';

/** Freight allocation (pure): `npm run test:freight`. */

const sum = (m: Map<string, number>) => Math.round([...m.values()].reduce((s, v) => s + v, 0) * 100) / 100;

// Pro-rata split, exact sum
{
  const m = allocateByValue(1000, [{ id: 'a', value: 7500 }, { id: 'b', value: 2500 }]);
  assert.equal(m.get('a'), 750); assert.equal(m.get('b'), 250);
}
// Awkward thirds still sum exactly (largest-remainder), never 999.99 / 1000.01
{
  const m = allocateByValue(100, [{ id: 'a', value: 1 }, { id: 'b', value: 1 }, { id: 'c', value: 1 }]);
  assert.equal(sum(m), 100);
  assert.deepEqual([...m.values()].sort(), [33.33, 33.33, 33.34]);
}
{
  const m = allocateByValue(0.05, [{ id: 'a', value: 3 }, { id: 'b', value: 3 }, { id: 'c', value: 3 }]);
  assert.equal(sum(m), 0.05, 'sub-cent-per-share totals are still conserved');
}
// Zero / negative values → equal split; single part gets everything; empty → empty
assert.deepEqual([...allocateByValue(90, [{ id: 'a', value: 0 }, { id: 'b', value: -5 }, { id: 'c', value: 0 }]).values()], [30, 30, 30]);
assert.equal(allocateByValue(123.45, [{ id: 'only', value: 10 }]).get('only'), 123.45);
assert.equal(allocateByValue(10, []).size, 0);

// suggestFreightPerUnit
const base = { orderId: 'o1', quantity: 1000, targetCurrency: 'USD', rates: { INR: 1, USD: 84, EUR: 90 } };

// single-order shipment, same currency
{
  const s = suggestFreightPerUnit({ ...base, shipments: [{ shipmentNumber: 'SH-1', amount: 1500, currency: 'USD', forwarderName: 'Maersk', orders: [{ orderId: 'o1', value: 20000 }] }] });
  assert.equal(s.perUnit, 1.5); assert.equal(s.totalShare, 1500); assert.deepEqual(s.problems, []);
}
// consolidated shipment: o1 is 25% of value → 25% of freight
{
  const s = suggestFreightPerUnit({ ...base, shipments: [{ shipmentNumber: 'SH-2', amount: 2000, currency: 'USD', forwarderName: 'MSC', orders: [{ orderId: 'o1', value: 5000 }, { orderId: 'o2', value: 15000 }] }] });
  assert.equal(s.totalShare, 500); assert.equal(s.perUnit, 0.5);
}
// foreign-currency quote converts via the base: INR 84000 → USD 1000
{
  const s = suggestFreightPerUnit({ ...base, shipments: [{ shipmentNumber: 'SH-3', amount: 84000, currency: 'INR', forwarderName: 'X', orders: [{ orderId: 'o1', value: 1 }] }] });
  assert.equal(s.totalShare, 1000); assert.equal(s.perUnit, 1);
}
// missing rate → reported, never guessed
{
  const s = suggestFreightPerUnit({ ...base, rates: { INR: 1, USD: 84 }, shipments: [{ shipmentNumber: 'SH-4', amount: 800, currency: 'EUR', forwarderName: 'X', orders: [{ orderId: 'o1', value: 1 }] }] });
  assert.equal(s.perUnit, null); assert.match(s.problems[0], /no exchange rate to USD/);
}
// two shipments, one convertible, one not → partial result AND a problem
{
  const s = suggestFreightPerUnit({ ...base, rates: { INR: 1, USD: 84 }, shipments: [
    { shipmentNumber: 'A', amount: 600, currency: 'USD', forwarderName: 'F1', orders: [{ orderId: 'o1', value: 1 }] },
    { shipmentNumber: 'B', amount: 400, currency: 'EUR', forwarderName: 'F2', orders: [{ orderId: 'o1', value: 1 }] },
  ] });
  assert.equal(s.perUnit, 0.6); assert.equal(s.problems.length, 1); assert.equal(s.sources.length, 1);
}
// none accepted / zero quantity / shipment not carrying this order
assert.match(suggestFreightPerUnit({ ...base, shipments: [] }).problems[0], /No shipment/);
assert.match(suggestFreightPerUnit({ ...base, quantity: 0, shipments: [{ shipmentNumber: 'S', amount: 10, currency: 'USD', forwarderName: 'F', orders: [{ orderId: 'o1', value: 1 }] }] }).problems[0], /no quantity/);
assert.equal(suggestFreightPerUnit({ ...base, shipments: [{ shipmentNumber: 'S', amount: 10, currency: 'USD', forwarderName: 'F', orders: [{ orderId: 'other', value: 1 }] }] }).perUnit, null);

console.log('✓ freight-allocation: pro-rata split, conservation, FX, partial/missing handling');
