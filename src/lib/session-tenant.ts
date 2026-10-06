import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "./prisma";
import { getTenantContext } from "./tenant";
import { isTenantAccessBlocked } from "./tenant-status";
import type { MembershipRole, TenantStatus } from "@prisma/client";

export type TenantSession = {
  userId: string;
  tenantId: string;
  role: MembershipRole;
  tenantStatus: TenantStatus;
};

// Re-exported so callers keep a single import site for the chokepoint and its policy.
export { isTenantAccessBlocked, BLOCKED_STATUSES } from "./tenant-status";

export class TenantSuspendedError extends Error {
  constructor(readonly status: TenantStatus) {
    super(`tenant_suspended: this workspace is ${status}`);
    this.name = "TenantSuspendedError";
  }
}

export type RequireTenantSessionOptions = {
  /**
   * Let a suspended or pending-deletion tenant through. Reserved for the two surfaces an owner
   * must still reach to get *out* of that state: billing (pay the invoice, reopen the portal) and
   * data export (take your data with you — DPDP data-principal right). A `deleted` tenant is
   * blocked even here.
   */
  allowSuspended?: boolean;
};

/**
 * Resolves the current tenant (from the request Host header) and the caller's membership/role
 * within it — the single chokepoint every server action/route must call before touching tenant data.
 *
 * The membership is read from the DATABASE, not from the session JWT. A JWT is not revocable, so
 * trusting its cached `memberships` claim meant a removed or demoted teammate kept their old access
 * until the token expired. The DB read (one indexed lookup on the Membership unique key) makes
 * removeMember()/updateMemberRole() take effect on the very next request. The JWT copy is still
 * refreshed on a TTL in src/auth.ts, but only drives nav and post-auth routing — never authorization.
 */
export async function requireTenantSession(
  options: RequireTenantSessionOptions = {},
): Promise<TenantSession> {
  const resolved = await resolveTenantSession();

  if (isTenantAccessBlocked(resolved.tenantStatus, options.allowSuspended)) {
    throw new TenantSuspendedError(resolved.tenantStatus);
  }

  return resolved;
}

/**
 * The session/tenant/membership resolution, memoised for the duration of one React render pass
 * (the DAL pattern the Next.js auth guide recommends — see
 * node_modules/next/dist/docs/01-app/02-guides/authentication.md "Creating a Data Access Layer").
 *
 * This matters because the read actions now each derive their own tenantId instead of being handed
 * one: an order detail page calls five of them, and without memoisation that would be five
 * `auth()` + tenant + membership round-trips per render. `cache()` collapses them to one.
 *
 * The status gate deliberately lives *outside* the memo so `allowSuspended` can't fragment the
 * cache key — and so a caller passing it can never widen access for anything else in the same pass.
 */
const resolveTenantSession = cache(async (): Promise<TenantSession> => {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");

  const tenant = await getTenantContext();
  if (!tenant) throw new Error("Unknown tenant");

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
    select: { role: true },
  });
  if (!membership) throw new Error("No membership in this tenant");

  return {
    userId: session.user.id,
    tenantId: tenant.id,
    role: membership.role,
    tenantStatus: tenant.status,
  };
});
