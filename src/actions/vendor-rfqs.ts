'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';

export async function listVendorRfqs(tenantId: string) {
  return prisma.vendorRfq.findMany({
    where: { tenantId },
    include: { invites: { include: { vendor: true } }, quotes: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getVendorRfq(tenantId: string, rfqId: string) {
  return prisma.vendorRfq.findFirst({
    where: { id: rfqId, tenantId },
    include: {
      invites: { include: { vendor: true } },
      quotes: { include: { vendor: true }, orderBy: { rate: 'asc' } },
      awardedQuote: { include: { vendor: true } },
    },
  });
}

export async function createVendorRfq(input: {
  rfqNumber: string;
  title: string;
  description?: string;
  quantity?: number;
  unit?: string;
  targetPrice?: number;
  dueDate?: Date;
  vendorIds: string[];
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to create RFQs');
  if (!input.title.trim()) throw new Error('Title is required');
  if (input.vendorIds.length === 0) throw new Error('Select at least one vendor to invite');

  const rfq = await prisma.vendorRfq.create({
    data: {
      tenantId,
      rfqNumber: input.rfqNumber,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      quantity: input.quantity ?? null,
      unit: input.unit || null,
      targetPrice: input.targetPrice ?? null,
      dueDate: input.dueDate || null,
      invites: { create: input.vendorIds.map((vendorId) => ({ vendorId })) },
    },
  });

  await writeAudit({
    session,
    collection: 'vendor_rfqs',
    documentId: rfq.id,
    action: 'create',
    summary: `Created RFQ ${rfq.rfqNumber} and invited ${input.vendorIds.length} vendor(s)`,
    after: { rfqNumber: rfq.rfqNumber, title: rfq.title, vendorCount: input.vendorIds.length },
  });

  revalidatePath('/dashboard/rfqs');
  return rfq;
}

export async function recordVendorRfqQuote(input: {
  rfqId: string;
  vendorId: string;
  rate: number;
  moqPieces?: number;
  leadTimeDays?: number;
  notes?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to record vendor quotes');

  const rfq = await prisma.vendorRfq.findFirst({ where: { id: input.rfqId, tenantId } });
  if (!rfq) throw new Error('RFQ not found');
  if (rfq.status !== 'open') throw new Error('This RFQ is no longer open');

  const quote = await prisma.vendorRfqQuote.upsert({
    where: { rfqId_vendorId: { rfqId: input.rfqId, vendorId: input.vendorId } },
    create: {
      rfqId: input.rfqId,
      vendorId: input.vendorId,
      rate: input.rate,
      moqPieces: input.moqPieces ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      notes: input.notes?.trim() || null,
    },
    update: {
      rate: input.rate,
      moqPieces: input.moqPieces ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      notes: input.notes?.trim() || null,
    },
  });

  await writeAudit({
    session,
    collection: 'vendor_rfqs',
    documentId: input.rfqId,
    action: 'pricing_change',
    summary: `Recorded quote from vendor ${input.vendorId} on RFQ ${rfq.rfqNumber}: ${input.rate}`,
    after: { vendorId: input.vendorId, rate: input.rate },
  });

  revalidatePath(`/dashboard/rfqs/${input.rfqId}`);
  return quote;
}

export async function awardVendorRfq(rfqId: string, quoteId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to award RFQs');

  const rfq = await prisma.vendorRfq.findFirst({ where: { id: rfqId, tenantId } });
  if (!rfq) throw new Error('RFQ not found');

  const quote = await prisma.vendorRfqQuote.findFirst({ where: { id: quoteId, rfqId } });
  if (!quote) throw new Error('Quote not found on this RFQ');

  await prisma.vendorRfq.update({
    where: { id: rfqId, tenantId },
    data: { status: 'awarded', awardedQuoteId: quoteId },
  });

  await writeAudit({
    session,
    collection: 'vendor_rfqs',
    documentId: rfqId,
    action: 'status_change',
    summary: `Awarded RFQ ${rfq.rfqNumber} to vendor ${quote.vendorId} at rate ${quote.rate}`,
    before: { status: rfq.status },
    after: { status: 'awarded', awardedQuoteId: quoteId },
  });

  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  revalidatePath('/dashboard/rfqs');
}

export async function closeVendorRfq(rfqId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to close RFQs');

  const rfq = await prisma.vendorRfq.findFirst({ where: { id: rfqId, tenantId } });
  if (!rfq) throw new Error('RFQ not found');

  await prisma.vendorRfq.update({ where: { id: rfqId, tenantId }, data: { status: 'closed' } });

  await writeAudit({
    session,
    collection: 'vendor_rfqs',
    documentId: rfqId,
    action: 'status_change',
    summary: `Closed RFQ ${rfq.rfqNumber} without award`,
    before: { status: rfq.status },
    after: { status: 'closed' },
  });

  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  revalidatePath('/dashboard/rfqs');
}
