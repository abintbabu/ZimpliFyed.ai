import assert from 'node:assert/strict';
import { FEATURE_FLAGS, FEATURE_FLAG_KEYS } from '../../lib/feature-flags';
import { MILESTONE_ORDER, MILESTONE_LABELS } from '../../lib/shipment-milestones';

/**
 * Registry invariants for the two lookup tables the UI renders straight out of: feature flags and
 * shipment milestones. A missing entry here is a blank label or an ungated surface in production, and
 * neither shows up in a type error. Pure: `npm run test:flags`.
 *
 * The DB-backed half (isFeatureEnabled override-vs-default resolution) is in the integration suite.
 */

// ── Feature flags ─────────────────────────────────────────────────────────────
assert.ok(FEATURE_FLAG_KEYS.length > 0);
assert.deepEqual([...FEATURE_FLAG_KEYS].sort(), Object.keys(FEATURE_FLAGS).sort(), 'KEYS and FEATURE_FLAGS agree');
assert.equal(new Set(FEATURE_FLAG_KEYS).size, FEATURE_FLAG_KEYS.length, 'no duplicate flag keys');

for (const key of FEATURE_FLAG_KEYS) {
  const meta = FEATURE_FLAGS[key];
  assert.ok(meta, `${key} has metadata`);
  assert.ok(meta.label.trim().length > 0, `${key} has a non-empty admin-console label`);
  assert.ok(meta.description.trim().length > 0, `${key} has a non-empty description`);
  assert.equal(typeof meta.default, 'boolean', `${key} has an explicit boolean default`);
  assert.match(key, /^[a-z0-9_]+$/, `${key} is snake_case (it is a DB key, not a display string)`);
}

// Every flag ships OFF by default. These gate outbound sends, PDF generation and inbox ingestion —
// a flag that defaulted to true would turn a feature on for every existing tenant the moment it merged.
for (const key of FEATURE_FLAG_KEYS) {
  assert.equal(FEATURE_FLAGS[key].default, false, `${key} must default to off (dark launch)`);
}

// The flags that gate an external, irreversible side effect must exist by exactly these names —
// the approve path in src/actions/action-queue.ts looks them up by string.
for (const gated of ['gmail_reply', 'whatsapp_notifications'] as const) {
  assert.ok(FEATURE_FLAG_KEYS.includes(gated), `${gated} gates an outbound send and must stay registered`);
}

// Labels are distinct, so the admin console's toggle list is unambiguous.
{
  const labels = FEATURE_FLAG_KEYS.map((k) => FEATURE_FLAGS[k].label);
  assert.equal(new Set(labels).size, labels.length, 'flag labels are unique');
}

// ── Shipment milestones ───────────────────────────────────────────────────────
assert.equal(new Set(MILESTONE_ORDER).size, MILESTONE_ORDER.length, 'no duplicate milestones in the timeline');
for (const m of MILESTONE_ORDER) {
  assert.ok(MILESTONE_LABELS[m]?.trim().length, `${m} has a human label`);
}
// Every labelled milestone appears in the ordering — an unordered one renders with no timeline position.
assert.deepEqual(
  [...MILESTONE_ORDER].sort(),
  Object.keys(MILESTONE_LABELS).sort(),
  'MILESTONE_ORDER and MILESTONE_LABELS cover exactly the same set',
);
// Physical sequence sanity: a container is gated in before it ships, and delivered last.
assert.equal(MILESTONE_ORDER[0], 'gate_in', 'gate_in is the first milestone');
assert.equal(MILESTONE_ORDER[MILESTONE_ORDER.length - 1], 'delivered', 'delivered is terminal');
assert.ok(MILESTONE_ORDER.indexOf('sob') < MILESTONE_ORDER.indexOf('arrival'), 'shipped-on-board precedes arrival');
assert.ok(MILESTONE_ORDER.indexOf('arrival') < MILESTONE_ORDER.indexOf('do_issued'), 'arrival precedes the delivery order');

console.log(`✓ flags + milestones: ${FEATURE_FLAG_KEYS.length} flags (all dark-launched, labelled), ${MILESTONE_ORDER.length}-step milestone timeline`);
