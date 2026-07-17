import assert from 'node:assert/strict';
import { alertWindowStart, complianceStatus } from '../../lib/compliance-deadlines';

/**
 * Compliance expiry status + alert windowing. Pure, no DB: `npm run test:compliance`.
 */

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

// ── complianceStatus ──────────────────────────────────────────────────────────
assert.equal(complianceStatus(null, 30), 'no_expiry');
assert.equal(complianceStatus(daysFromNow(-1), 30), 'expired', 'past date → expired');
assert.equal(complianceStatus(daysFromNow(10), 30), 'expiring_soon', 'within 30d lead window');
assert.equal(complianceStatus(daysFromNow(60), 30), 'ok', 'beyond lead window');
assert.equal(complianceStatus(daysFromNow(10), 5), 'ok', 'shorter lead window → still ok');

// ── alertWindowStart: renewalLeadDays before expiry ───────────────────────────
{
  const expires = new Date('2026-12-01T00:00:00Z');
  const start = alertWindowStart(expires, 30);
  assert.equal(start.toISOString(), '2026-11-01T00:00:00.000Z');
  // A lastAlertedAt before the window start belongs to a previous cycle → re-alert.
  assert.ok(new Date('2026-10-15T00:00:00Z') < start);
  assert.ok(new Date('2026-11-20T00:00:00Z') >= start, 'inside current window → already alerted');
}

console.log('✓ compliance-deadlines: status boundaries + alert windowing');
