import assert from 'node:assert/strict';
import { lcDeadlineAlerts, lcTermProblems, type LcDeadlineInput } from '../../lib/lc-deadlines';

/** LC deadline + term checks (pure): `npm run test:lc`. */

const now = new Date('2026-10-05T15:30:00Z');
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const lc = (o: Partial<LcDeadlineInput> = {}): LcDeadlineInput => ({ status: 'advised', expiryDate: null, latestShipmentDate: null, ...o });

// Nothing due → no alerts; far-off dates → no alerts
assert.deepEqual(lcDeadlineAlerts(lc(), false, now), []);
assert.deepEqual(lcDeadlineAlerts(lc({ expiryDate: d('2026-12-01'), latestShipmentDate: d('2026-11-15') }), false, now), []);

// Window boundary: exactly 14 days is in, 15 is out
assert.equal(lcDeadlineAlerts(lc({ latestShipmentDate: d('2026-10-19') }), false, now).length, 1);
assert.equal(lcDeadlineAlerts(lc({ latestShipmentDate: d('2026-10-20') }), false, now).length, 0);

// Severity bands
{
  const [a] = lcDeadlineAlerts(lc({ latestShipmentDate: d('2026-10-15') }), false, now);
  assert.equal(a.daysLeft, 10); assert.equal(a.severity, 'attention'); assert.equal(a.band, 'd14');
  const [b] = lcDeadlineAlerts(lc({ latestShipmentDate: d('2026-10-08') }), false, now);
  assert.equal(b.daysLeft, 3); assert.equal(b.severity, 'urgent'); assert.equal(b.band, 'd3');
  const [c] = lcDeadlineAlerts(lc({ latestShipmentDate: d('2026-10-05') }), false, now);
  assert.equal(c.daysLeft, 0, 'a deadline today is 0 days left, not negative, even late in the day'); assert.equal(c.overdue, false);
  const [e] = lcDeadlineAlerts(lc({ latestShipmentDate: d('2026-10-04') }), false, now);
  assert.equal(e.daysLeft, -1); assert.equal(e.overdue, true); assert.equal(e.band, 'overdue'); assert.equal(e.severity, 'urgent');
}

// Both dates → both alerts, shipment first
{
  const a = lcDeadlineAlerts(lc({ latestShipmentDate: d('2026-10-10'), expiryDate: d('2026-10-12') }), false, now);
  assert.deepEqual(a.map((x) => x.kind), ['shipment', 'expiry']);
}

// Shipped order suppresses the shipment alert but NOT the expiry alert
{
  const a = lcDeadlineAlerts(lc({ latestShipmentDate: d('2026-10-02'), expiryDate: d('2026-10-12') }), true, now);
  assert.deepEqual(a.map((x) => x.kind), ['expiry']);
}

// Status gating: only open LCs alert
for (const status of ['documents_presented', 'accepted', 'paid', 'expired', 'cancelled'] as const) {
  assert.deepEqual(lcDeadlineAlerts(lc({ status, expiryDate: d('2026-10-04') }), false, now), [], `${status} must not alert`);
}
for (const status of ['draft', 'advised', 'amended'] as const) {
  assert.equal(lcDeadlineAlerts(lc({ status, expiryDate: d('2026-10-04') }), false, now).length, 1, `${status} must alert`);
}

// Term problems
assert.deepEqual(lcTermProblems({ amount: 1000, currency: 'USD', expiryDate: d('2026-12-01'), latestShipmentDate: d('2026-11-01') }), []);
assert.match(lcTermProblems({ amount: 1000, currency: 'USD', expiryDate: d('2026-10-01'), latestShipmentDate: d('2026-11-01') })[0], /before the latest shipment/);
assert.match(lcTermProblems({ amount: 0, currency: 'USD', expiryDate: null, latestShipmentDate: null })[0], /above 0/);
assert.match(lcTermProblems({ amount: 500, currency: null, expiryDate: null, latestShipmentDate: null })[0], /needs a currency/);
{
  const t = { amount: 9000, currency: 'USD', expiryDate: null, latestShipmentDate: null };
  assert.match(lcTermProblems(t, { total: 9700, currency: 'USD' })[0], /below the order value/);
  assert.deepEqual(lcTermProblems({ ...t, amount: 9700 }, { total: 9700, currency: 'USD' }), [], 'exact cover is fine');
  assert.match(lcTermProblems(t, { total: 9700, currency: 'EUR' })[0], /LC is in USD but the order is in EUR/);
  assert.deepEqual(lcTermProblems({ ...t, amount: null, currency: null }, { total: 9700, currency: 'USD' }), [], 'no amount entered → nothing to compare');
}

console.log('✓ lc-deadlines: windows, bands, status gating, shipped suppression, term problems');
