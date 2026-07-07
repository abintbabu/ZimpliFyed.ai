'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import type { ComplianceCategory } from '@prisma/client';

export async function listComplianceItems(tenantId: string) {
  return prisma.complianceItem.findMany({ where: { tenantId }, orderBy: { expiresAt: 'asc' } });
}

export async function createComplianceItem(input: {
  category: ComplianceCategory;
  name: string;
  issuingAuthority?: string;
  documentNumber?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  renewalLeadDays?: number;
  notes?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'compliance:write')) throw new Error('You do not have permission to manage compliance items');
  if (!input.name.trim()) throw new Error('Name is required');

  const item = await prisma.complianceItem.create({
    data: {
      tenantId,
      category: input.category,
      name: input.name.trim(),
      issuingAuthority: input.issuingAuthority?.trim() || null,
      documentNumber: input.documentNumber?.trim() || null,
      issuedAt: input.issuedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      renewalLeadDays: input.renewalLeadDays ?? 30,
      notes: input.notes?.trim() || null,
    },
  });

  await writeAudit({
    session,
    collection: 'compliance_items',
    documentId: item.id,
    action: 'create',
    summary: `Added compliance item ${item.name}`,
    after: { category: item.category, expiresAt: item.expiresAt },
  });

  revalidatePath('/dashboard/compliance');
  return item;
}

export async function updateComplianceItem(
  id: string,
  input: Partial<{
    name: string;
    issuingAuthority: string;
    documentNumber: string;
    issuedAt: Date | null;
    expiresAt: Date | null;
    renewalLeadDays: number;
    notes: string;
  }>,
) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'compliance:write')) throw new Error('You do not have permission to manage compliance items');

  const before = await prisma.complianceItem.findFirst({ where: { id, tenantId } });
  if (!before) throw new Error('Compliance item not found');

  const item = await prisma.complianceItem.update({ where: { id, tenantId }, data: input });

  await writeAudit({
    session,
    collection: 'compliance_items',
    documentId: id,
    action: 'update',
    summary: `Updated compliance item ${before.name}`,
    before: { expiresAt: before.expiresAt },
    after: { expiresAt: item.expiresAt },
  });

  revalidatePath('/dashboard/compliance');
  return item;
}

export async function deleteComplianceItem(id: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'compliance:write')) throw new Error('You do not have permission to manage compliance items');

  const before = await prisma.complianceItem.findFirst({ where: { id, tenantId } });
  if (!before) throw new Error('Compliance item not found');

  await prisma.complianceItem.delete({ where: { id, tenantId } });

  await writeAudit({
    session,
    collection: 'compliance_items',
    documentId: id,
    action: 'delete',
    summary: `Deleted compliance item ${before.name}`,
    before: { name: before.name },
  });

  revalidatePath('/dashboard/compliance');
}
