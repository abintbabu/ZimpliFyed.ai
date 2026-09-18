import 'server-only';
import { headers } from 'next/headers';
import { prisma } from './prisma';
import { classifyHost } from './tenant-resolver';
import type { Tenant } from '@prisma/client';

/** Resolve the Tenant row for the current request based on the Host header. Returns null for any
 * host that doesn't resolve to a real tenant slug (unknown, platform, or an unverified custom
 * domain) — never falls back to a default tenant (EXPORT_OS_MASTER_PLAN §4.1/§4.2). */
export async function getTenantContext(): Promise<Tenant | null> {
  const h = await headers();
  const resolution = classifyHost(h.get('host'));

  const slug = resolution.kind === 'subdomain' || resolution.kind === 'dev' ? resolution.slug : null;
  if (!slug) return null;

  return prisma.tenant.findUnique({ where: { slug } });
}

/**
 * Guard for server actions: throws if the caller's session tenantId doesn't
 * match the tenant resolved from the request host. Prevents a session token
 * scoped to tenant A from writing data under tenant B via a spoofed Host
 * header or stale client cache.
 */
export function assertTenantContext(sessionTenantId: string | undefined, requestTenantId: string): void {
  if (sessionTenantId && sessionTenantId !== requestTenantId) {
    throw new Error(`Tenant mismatch: session=${sessionTenantId}, request=${requestTenantId}`);
  }
}
