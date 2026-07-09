'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import type { BusinessType } from '@prisma/client';

export async function getTenantProfile(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      slug: true,
      businessType: true,
      exportProducts: true,
      primaryMarkets: true,
      teamSizeBand: true,
      plan: true,
      status: true,
    },
  });
}

export async function updateTenantProfile(input: {
  name: string;
  businessType?: BusinessType | '';
  exportProducts?: string;
  primaryMarkets?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'users:manage')) throw new Error('Only owners and admins can update company settings');
  if (!input.name.trim()) throw new Error('Company name is required');

  const before = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!before) throw new Error('Tenant not found');

  const primaryMarkets = input.primaryMarkets
    ? input.primaryMarkets.split(',').map((m) => m.trim()).filter(Boolean)
    : [];

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: input.name.trim(),
      businessType: input.businessType || null,
      exportProducts: input.exportProducts?.trim() || null,
      primaryMarkets,
    },
  });

  await writeAudit({
    session,
    collection: 'tenant',
    documentId: tenantId,
    action: 'update',
    summary: `Updated company profile for ${input.name.trim()}`,
    before: { name: before.name, businessType: before.businessType },
    after: { name: input.name.trim(), businessType: input.businessType || null },
  });

  revalidatePath('/dashboard/settings');
}
