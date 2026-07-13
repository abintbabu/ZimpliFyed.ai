import type { TenantStatus } from '@prisma/client';
import type { DomainEventType } from '@/lib/domain-events';

/**
 * Tenant billing lifecycle state machine (BILLING_SPEC §3), as a PURE decision function so the exact
 * transition rules are unit-testable without a database. The nightly sweep (scripts/billing-lifecycle-sweep.ts)
 * reads/writes Postgres and delegates every branch to `evaluateLifecycle`.
 *
 *   trial(14d) ─► active (paid, provider linked) | free-downgrade
 *   active ─► past_due ─► suspended (day 15 of past_due) ─► pending_deletion (day 60 suspended) ─► deleted (day 7)
 *   past_due dunning nudges on days 1/4/8
 *
 * `deleted` only flips status — data is never auto-erased for non-payment (BILLING_SPEC + irreversible-op norms).
 */

export const DUNNING_SUSPEND_DAY = 15;
export const DUNNING_NUDGE_DAYS = [1, 4, 8] as const;
export const SUSPEND_TO_PENDING_DAYS = 60;
export const PENDING_TO_DELETE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LifecycleTenant = {
  status: TenantStatus;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
  suspendedAt: Date | null;
  pendingDeletionAt: Date | null;
  /** Whether a billing provider (Stripe/Razorpay) is linked — a mid-trial checkout. */
  hasProvider: boolean;
};

export type LifecycleDecision =
  | { action: 'none' }
  /** Trial ended but they already checked out — just clear the trial marker, a webhook set them active. */
  | { action: 'clear_trial_marker' }
  | { action: 'downgrade_to_free'; event: 'billing.trial_expired' }
  | { action: 'suspend'; event: 'billing.suspended' }
  | { action: 'dunning_nudge'; day: number; event: 'billing.dunning_nudge' }
  | { action: 'to_pending_deletion'; event: 'billing.pending_deletion' }
  | { action: 'to_deleted'; event: 'billing.deleted' };

function daysSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / DAY_MS);
}

/** Decide the single next lifecycle action for a tenant at `now`. Returns `{ action: 'none' }` when nothing is due. */
export function evaluateLifecycle(tenant: LifecycleTenant, now: Date = new Date()): LifecycleDecision {
  switch (tenant.status) {
    case 'trial': {
      if (!tenant.trialEndsAt || tenant.trialEndsAt >= now) return { action: 'none' };
      return tenant.hasProvider
        ? { action: 'clear_trial_marker' }
        : { action: 'downgrade_to_free', event: 'billing.trial_expired' };
    }
    case 'past_due': {
      if (!tenant.pastDueSince) return { action: 'none' };
      const days = daysSince(tenant.pastDueSince, now);
      if (days >= DUNNING_SUSPEND_DAY) return { action: 'suspend', event: 'billing.suspended' };
      if ((DUNNING_NUDGE_DAYS as readonly number[]).includes(days)) {
        return { action: 'dunning_nudge', day: days, event: 'billing.dunning_nudge' };
      }
      return { action: 'none' };
    }
    case 'suspended': {
      if (!tenant.suspendedAt) return { action: 'none' };
      if (daysSince(tenant.suspendedAt, now) >= SUSPEND_TO_PENDING_DAYS) {
        return { action: 'to_pending_deletion', event: 'billing.pending_deletion' };
      }
      return { action: 'none' };
    }
    case 'pending_deletion': {
      if (!tenant.pendingDeletionAt) return { action: 'none' };
      if (daysSince(tenant.pendingDeletionAt, now) >= PENDING_TO_DELETE_DAYS) {
        return { action: 'to_deleted', event: 'billing.deleted' };
      }
      return { action: 'none' };
    }
    default:
      return { action: 'none' };
  }
}

/** Type guard: decisions that carry a DomainEvent to log. */
export function decisionEvent(d: LifecycleDecision): DomainEventType | null {
  return 'event' in d ? d.event : null;
}
