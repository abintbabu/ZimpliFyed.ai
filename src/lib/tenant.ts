import 'server-only';
import { headers } from 'next/headers';
import { prisma } from './prisma';
import { resolveTenantSlug } from './tenant-resolver';
import type { Tenant } from '@prisma/client';

/** Resolve the Tenant row for the current request based on the Host header. */
export async function getTenantContext(): Promise<Tenant | null> {
  const h = await headers();
  const slug = resolveTenantSlug(h.get('host'));
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
