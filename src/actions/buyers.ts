'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { draftBuyerFollowup } from '@/lib/ai/buyer-followup';
import type { ActivityKind } from '@prisma/client';

export async function listBuyers(tenantId: string) {
  return prisma.buyer.findMany({
    where: { tenantId },
    include: { contacts: true, _count: { select: { quotes: true, orders: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getBuyer(tenantId: string, buyerId: string) {
  return prisma.buyer.findFirst({
    where: { id: buyerId, tenantId },
    include: {
      contacts: true,
      priceLists: { include: { items: { include: { product: true } } } },
      quotes: { orderBy: { createdAt: 'desc' } },
      orders: { orderBy: { createdAt: 'desc' } },
    },
  });
}

export async function listBuyerActivity(tenantId: string, buyerId: string) {
  return prisma.activity.findMany({
    where: { tenantId, entityType: 'buyer', entityId: buyerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createBuyer(input: {
  name: string;
  country?: string;
  address?: string;
  paymentTermsDefault?: string;
  currencyDefault?: string;
  creditLimit?: number;
  source?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'customers:write')) throw new Error('You do not have permission to create buyers');
  if (!input.name.trim()) throw new Error('Name is required');

  const buyer = await prisma.buyer.create({
    data: {
      tenantId,
      name: input.name.trim(),
      country: input.country?.trim() || null,
      address: input.address?.trim() || null,
      paymentTermsDefault: input.paymentTermsDefault?.trim() || null,
      currencyDefault: input.currencyDefault?.trim() || 'USD',
      creditLimit: input.creditLimit ?? null,
      source: input.source ?? 'manual',
    },
  });

  await writeAudit({
    session,
    collection: 'buyers',
    documentId: buyer.id,
    action: 'create',
    summary: `Created buyer ${buyer.name}`,
    after: { name: buyer.name, country: buyer.country },
  });

  revalidatePath('/dashboard/buyers');
  return buyer;
}

export async function updateBuyer(
  buyerId: string,
  input: Partial<{
    name: string;
    country: string;
    address: string;
    paymentTermsDefault: string;
    currencyDefault: string;
    creditLimit: number | null;
    riskNotes: string;
  }>,
) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'customers:write')) throw new Error('You do not have permission to update buyers');

  const before = await prisma.buyer.findFirst({ where: { id: buyerId, tenantId } });
  if (!before) throw new Error('Buyer not found');

  await prisma.buyer.update({ where: { id: buyerId, tenantId }, data: input });

  await writeAudit({
    session,
    collection: 'buyers',
    documentId: buyerId,
    action: 'update',
    summary: `Updated buyer ${before.name}`,
    before,
    after: input,
  });

  revalidatePath('/dashboard/buyers');
  revalidatePath(`/dashboard/buyers/${buyerId}`);
}

export async function convertLeadToBuyer(leadId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'customers:write')) throw new Error('You do not have permission to convert leads');

  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
  if (!lead) throw new Error('Lead not found');
  if (lead.convertedBuyerId) return lead.convertedBuyerId;

  const buyer = await prisma.$transaction(async (tx) => {
    const created = await tx.buyer.create({
      data: {
        tenantId,
        name: lead.company?.trim() || lead.name,
        country: lead.country,
        source: 'lead',
        convertedFromLeadId: lead.id,
        contacts: lead.email || lead.phone
          ? { create: [{ name: lead.name, email: lead.email, phone: lead.phone, isPrimary: true }] }
          : undefined,
      },
    });
    await tx.lead.update({ where: { id: leadId }, data: { convertedBuyerId: created.id } });
    return created;
  });

  await writeAudit({
    session,
    collection: 'buyers',
    documentId: buyer.id,
    action: 'create',
    summary: `Converted lead ${lead.name} into buyer ${buyer.name}`,
    after: { name: buyer.name, convertedFromLeadId: lead.id },
  });

  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/buyers');
  return buyer.id;
}

export async function createContact(input: {
  buyerId: string;
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  role?: string;
  isPrimary?: boolean;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'customers:write')) throw new Error('You do not have permission to add contacts');
  if (!input.name.trim()) throw new Error('Name is required');

  const buyer = await prisma.buyer.findFirst({ where: { id: input.buyerId, tenantId } });
  if (!buyer) throw new Error('Buyer not found');

  const contact = await prisma.contact.create({
    data: {
      buyerId: input.buyerId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      role: input.role?.trim() || null,
      isPrimary: input.isPrimary ?? false,
    },
  });

  revalidatePath(`/dashboard/buyers/${input.buyerId}`);
  return contact;
}

export async function createActivity(input: {
  entityType: 'buyer' | 'lead' | 'order';
  entityId: string;
  kind: ActivityKind;
  subject?: string;
  body?: string;
  dueAt?: Date;
}) {
  const session = await requireTenantSession();
  const { tenantId, userId } = session;

  const activity = await prisma.activity.create({
    data: {
      tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      kind: input.kind,
      subject: input.subject?.trim() || null,
      body: input.body?.trim() || null,
      dueAt: input.dueAt ?? null,
      createdByUserId: userId,
    },
  });

  if (input.entityType === 'buyer') revalidatePath(`/dashboard/buyers/${input.entityId}`);
  return activity;
}

export async function completeActivity(activityId: string) {
  const { tenantId } = await requireTenantSession();
  const activity = await prisma.activity.findFirst({ where: { id: activityId, tenantId } });
  if (!activity) throw new Error('Activity not found');

  await prisma.activity.update({ where: { id: activityId }, data: { doneAt: new Date() } });
  if (activity.entityType === 'buyer') revalidatePath(`/dashboard/buyers/${activity.entityId}`);
}

/** Drafts a follow-up nudge from a buyer's recent context. The output is a draft only — a human reviews/edits it before it's logged or sent. */
export async function draftBuyerFollowupAction(buyerId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'customers:read')) throw new Error('You do not have permission to view this buyer');

  const buyer = await prisma.buyer.findFirst({
    where: { id: buyerId, tenantId },
    include: {
      quotes: { orderBy: { createdAt: 'desc' }, take: 3 },
      orders: { orderBy: { createdAt: 'desc' }, take: 3 },
    },
  });
  if (!buyer) throw new Error('Buyer not found');

  const activities = await prisma.activity.findMany({
    where: { tenantId, entityType: 'buyer', entityId: buyerId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const context = [
    `Buyer: ${buyer.name} (${buyer.country ?? 'country unknown'})`,
    `Payment terms: ${buyer.paymentTermsDefault ?? 'not set'} · Currency: ${buyer.currencyDefault}`,
    buyer.quotes.length > 0
      ? `Recent quotes: ${buyer.quotes.map((q) => `${q.quoteNumber} (${q.status}, ${q.currency} ${q.total.toFixed(2)})`).join('; ')}`
      : 'No quotes yet.',
    buyer.orders.length > 0
      ? `Recent orders: ${buyer.orders.map((o) => `${o.orderNumber} (${o.status})`).join('; ')}`
      : 'No orders yet.',
    activities.length > 0
      ? `Recent activity (most recent first): ${activities.map((a) => `[${a.kind}] ${a.subject ?? ''} ${a.body ?? ''}`.trim()).join(' | ')}`
      : 'No prior activity logged.',
  ].join('\n');

  const { draft, interactionId } = await draftBuyerFollowup(context, tenantId, session.userId);

  return { ...draft, interactionId };
}
