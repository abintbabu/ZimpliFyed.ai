import assert from 'node:assert/strict';
import { resolvePeriodKey } from '../../lib/doc-engine/numbering';

/**
 * EXPORT_OS_MASTER_PLAN §13.1 "Numbering" table-test row — the subset testable without a live DB
 * (FY rollover boundaries, calendar mode, character/length rules). The concurrency ("gapless under
 * 50 concurrent issues"), declared-floor, and cancel-at-nil assertions need a live Postgres instance
 * and are covered separately (src/tests/doc-engine/numbering-live.test.ts).
 *
 * Run: npx tsx --conditions=react-server src/tests/doc-engine/numbering.test.ts
 */

// ── resolvePeriodKey: india_fy rollover at the exact 31 Mar / 1 Apr boundary ────
assert.equal(resolvePeriodKey('india_fy', new Date('2026-04-01T00:00:00')), '2026-27', 'FY starts 1 Apr');
assert.equal(resolvePeriodKey('india_fy', new Date('2026-03-31T23:59:59')), '2025-26', 'FY ends 31 Mar');
assert.equal(resolvePeriodKey('india_fy', new Date('2026-01-15T00:00:00')), '2025-26', 'mid-FY, before rollover');
assert.equal(resolvePeriodKey('india_fy', new Date('2026-12-31T00:00:00')), '2026-27', 'mid-FY, after rollover');
assert.equal(resolvePeriodKey('india_fy', new Date('2000-04-01T00:00:00')), '2000-01', 'century-boundary FY label pads correctly');

// ── resolvePeriodKey: calendar mode is the plain year, no rollover logic ───────
assert.equal(resolvePeriodKey('calendar', new Date('2026-03-31T00:00:00')), '2026');
assert.equal(resolvePeriodKey('calendar', new Date('2026-04-01T00:00:00')), '2026');
assert.equal(resolvePeriodKey('calendar', new Date('2026-12-31T00:00:00')), '2026');

// ── resolvePeriodKey: `none` is a constant period, never rolls over ────────────
assert.equal(resolvePeriodKey('none', new Date('2026-01-01T00:00:00')), 'all');
assert.equal(resolvePeriodKey('none', new Date('2099-12-31T00:00:00')), 'all');

console.log('✓ doc-engine numbering: FY rollover (31 Mar/1 Apr boundary), calendar mode, constant period');
