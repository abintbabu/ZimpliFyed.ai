'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
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
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'leads:write')) throw new Error('You do not have permission to create leads');
  if (!input.name.trim()) throw new Error('Name is required');

  const lead = await prisma.lead.create({
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

  await writeAudit({
    session,
    collection: 'leads',
    documentId: lead.id,
    action: 'create',
    summary: `Created lead ${lead.name}`,
    after: { name: lead.name, company: lead.company },
  });

  revalidatePath('/dashboard/leads');
}

export async function updateLeadStage(leadId: string, stage: LeadStage) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'leads:write')) throw new Error('You do not have permission to update leads');

  const before = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
  if (!before) throw new Error('Lead not found');

  await prisma.lead.update({ where: { id: leadId, tenantId }, data: { stage } });

  await writeAudit({
    session,
    collection: 'leads',
    documentId: leadId,
    action: 'update',
    summary: `Moved lead ${before.name} to stage ${stage}`,
    before: { stage: before.stage },
    after: { stage },
  });

  revalidatePath('/dashboard/leads');
}
