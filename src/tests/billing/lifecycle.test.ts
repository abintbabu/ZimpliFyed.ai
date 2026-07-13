import assert from 'node:assert/strict';
import { evaluateLifecycle, type LifecycleTenant, type LifecycleDecision } from '../../lib/billing/lifecycle';

/**
 * Billing lifecycle e2e matrix (DEV_PLAN_100 Sprint 6). Exercises the full BILLING_SPEC §3 state machine —
 * trial → paid/free, active → past_due → suspended → pending_deletion → deleted, plus dunning nudge days —
 * as a pure decision table. Pure, no DB: run with `npm run test:billing`.
 */

const NOW = new Date('2026-07-13T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

function tenant(overrides: Partial<LifecycleTenant>): LifecycleTenant {
  return {
    status: 'active',
    trialEndsAt: null,
    pastDueSince: null,
    suspendedAt: null,
    pendingDeletionAt: null,
    hasProvider: false,
    ...overrides,
  };
}

const cases: { name: string; input: LifecycleTenant; expect: LifecycleDecision }[] = [
  // ── Trial ────────────────────────────────────────────────────────────────
  { name: 'trial not yet expired → none', input: tenant({ status: 'trial', trialEndsAt: daysAgo(-2) }), expect: { action: 'none' } },
  { name: 'trial expired, no provider → downgrade to free', input: tenant({ status: 'trial', trialEndsAt: daysAgo(1) }), expect: { action: 'downgrade_to_free', event: 'billing.trial_expired' } },
  { name: 'trial expired, checked out → clear marker', input: tenant({ status: 'trial', trialEndsAt: daysAgo(1), hasProvider: true }), expect: { action: 'clear_trial_marker' } },

  // ── Active / cancelled ─────────────────────────────────────────────────────
  { name: 'active → none', input: tenant({ status: 'active' }), expect: { action: 'none' } },

  // ── Past due dunning ───────────────────────────────────────────────────────
  { name: 'past_due day 0 → none', input: tenant({ status: 'past_due', pastDueSince: daysAgo(0) }), expect: { action: 'none' } },
  { name: 'past_due day 1 → nudge', input: tenant({ status: 'past_due', pastDueSince: daysAgo(1) }), expect: { action: 'dunning_nudge', day: 1, event: 'billing.dunning_nudge' } },
  { name: 'past_due day 4 → nudge', input: tenant({ status: 'past_due', pastDueSince: daysAgo(4) }), expect: { action: 'dunning_nudge', day: 4, event: 'billing.dunning_nudge' } },
  { name: 'past_due day 8 → nudge', input: tenant({ status: 'past_due', pastDueSince: daysAgo(8) }), expect: { action: 'dunning_nudge', day: 8, event: 'billing.dunning_nudge' } },
  { name: 'past_due day 5 (not a nudge day) → none', input: tenant({ status: 'past_due', pastDueSince: daysAgo(5) }), expect: { action: 'none' } },
  { name: 'past_due day 15 → suspend', input: tenant({ status: 'past_due', pastDueSince: daysAgo(15) }), expect: { action: 'suspend', event: 'billing.suspended' } },
  { name: 'past_due day 30 → suspend', input: tenant({ status: 'past_due', pastDueSince: daysAgo(30) }), expect: { action: 'suspend', event: 'billing.suspended' } },
  { name: 'past_due but no pastDueSince → none', input: tenant({ status: 'past_due', pastDueSince: null }), expect: { action: 'none' } },

  // ── Suspended → pending_deletion ───────────────────────────────────────────
  { name: 'suspended 59d → none', input: tenant({ status: 'suspended', suspendedAt: daysAgo(59) }), expect: { action: 'none' } },
  { name: 'suspended 60d → pending_deletion', input: tenant({ status: 'suspended', suspendedAt: daysAgo(60) }), expect: { action: 'to_pending_deletion', event: 'billing.pending_deletion' } },

  // ── Pending deletion → deleted ─────────────────────────────────────────────
  { name: 'pending_deletion 6d → none', input: tenant({ status: 'pending_deletion', pendingDeletionAt: daysAgo(6) }), expect: { action: 'none' } },
  { name: 'pending_deletion 7d → deleted', input: tenant({ status: 'pending_deletion', pendingDeletionAt: daysAgo(7) }), expect: { action: 'to_deleted', event: 'billing.deleted' } },

  // ── Terminal ───────────────────────────────────────────────────────────────
  { name: 'deleted → none', input: tenant({ status: 'deleted' }), expect: { action: 'none' } },
];

let passed = 0;
for (const c of cases) {
  assert.deepEqual(evaluateLifecycle(c.input, NOW), c.expect, c.name);
  passed++;
}

console.log(`✓ billing lifecycle: ${passed} matrix cases pass (trial → free/paid, dunning, suspend, deletion)`);
