import type { TenantStatus } from '@prisma/client';

/**
 * Tenant-status access policy, deliberately in its own module.
 *
 * It lives apart from src/lib/session-tenant.ts because that file is `server-only` and imports
 * `@/auth`, which drags in next-auth and `next/navigation` — those fail to load outside a Next
 * server context, so anything importing them cannot be unit-tested (the same reason
 * src/tests/doc-engine/numbering-live.test.ts can't run). Keeping the policy pure means the whole
 * status matrix is testable offline, which is the point: this function decides whether a paying
 * customer can use the product.
 */

/**
 * Statuses that lock the product. The billing lifecycle (src/lib/billing/lifecycle.ts) walks
 * trial → active → past_due → suspended → pending_deletion → deleted.
 *
 * `past_due` is deliberately NOT here: it's a paying customer being dunned, and locking them out
 * on the first failed card charge would be a self-inflicted churn event.
 */
export const BLOCKED_STATUSES: ReadonlySet<TenantStatus> = new Set<TenantStatus>([
  'suspended',
  'pending_deletion',
  'deleted',
]);

/**
 * Whether a tenant in `status` is denied app access.
 *
 * `allowSuspended` is the escape hatch for the two surfaces an owner must still reach to get *out*
 * of a locked state: billing (pay the invoice) and data export (the DPDP data-principal right).
 * It never unlocks `deleted`.
 */
export function isTenantAccessBlocked(status: TenantStatus, allowSuspended = false): boolean {
  if (!BLOCKED_STATUSES.has(status)) return false;
  return !(allowSuspended && status !== 'deleted');
}
