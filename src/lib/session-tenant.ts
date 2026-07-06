import "server-only";
import { auth } from "@/auth";
import { getTenantContext } from "./tenant";
import type { MembershipRole } from "@prisma/client";

export type TenantSession = {
  userId: string;
  tenantId: string;
  role: MembershipRole;
};

/**
 * Resolves the current tenant (from the request Host header) and the caller's
 * membership/role within it. Returns null if unauthenticated or if the caller
 * has no membership in the tenant the request is scoped to — the single
 * chokepoint every server action/route must call before touching tenant data.
 */
export async function requireTenantSession(): Promise<TenantSession> {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");

  const tenant = await getTenantContext();
  if (!tenant) throw new Error("Unknown tenant");

  const membership = session.user.memberships.find((m) => m.tenantId === tenant.id);
  if (!membership) throw new Error("No membership in this tenant");

  return { userId: session.user.id, tenantId: tenant.id, role: membership.role };
}
