import 'server-only';
import { prisma } from '@/lib/prisma';

const SYSTEM_TENANT_SLUG = '__public_tools__';

let cachedId: string | null = null;

/** Attribution tenant for unauthenticated/public AI usage (e.g. the marketing HS-finder tool), so AiInteraction's
 * required tenantId still holds without inventing per-visitor tenants. Not a real customer tenant. */
export async function getSystemTenantId(): Promise<string> {
  if (cachedId) return cachedId;
  const tenant = await prisma.tenant.upsert({
    where: { slug: SYSTEM_TENANT_SLUG },
    create: { slug: SYSTEM_TENANT_SLUG, name: 'Public tools (system)', plan: 'enterprise' },
    update: {},
    select: { id: true },
  });
  cachedId = tenant.id;
  return cachedId;
}
