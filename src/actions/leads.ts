'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import type { LeadStage } from '@prisma/client';

export async function listLeads(tenantId: string) {
  return prisma.lead.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createLead(input: {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  itemsInterested?: string;
}) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'leads:write')) throw new Error('You do not have permission to create leads');
  if (!input.name.trim()) throw new Error('Name is required');

  await prisma.lead.create({
    data: {
      tenantId,
      source: 'manual',
      name: input.name.trim(),
      company: input.company?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      itemsInterested: input.itemsInterested?.trim() || null,
    },
  });

  revalidatePath('/dashboard/leads');
}

export async function updateLeadStage(leadId: string, stage: LeadStage) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'leads:write')) throw new Error('You do not have permission to update leads');

  await prisma.lead.update({ where: { id: leadId, tenantId }, data: { stage } });
  revalidatePath('/dashboard/leads');
}
