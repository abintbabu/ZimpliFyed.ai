'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { allocateDocNumber } from '@/lib/doc-number-alloc';
import {
  canTransitionPo, isPoEditable, normalizePoLines, poTotal, poLineFromAward, defaultDeliveryDate,
  type PoLineInput, type PoStatus,
} from '@/lib/purchase-order';

export async function listPurchaseOrders() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return [];
  return prisma.purchaseOrder.findMany({ where: { tenantId }, include: { vendor: true }, orderBy: { createdAt: 'desc' } });
}

export async function getPurchaseOrder(poId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return null;
  return prisma.purchaseOrder.findFirst({
    where: { id: poId, tenantId },
    include: { vendor: true, lines: { orderBy: { sortOrder: 'asc' } } },
  });
}

/** The PO raised from an RFQ, if any — used by the RFQ page to link instead of offering to create again. */
export async function getPurchaseOrderForRfq(rfqId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return null;
  return prisma.purchaseOrder.findFirst({ where: { vendorRfqId: rfqId, tenantId }, select: { id: true, poNumber: true, status: true } });
}

/**
 * Raises a draft PO from an awarded RFQ. Idempotent: the unique `vendorRfqId` means a second call (double
 * click, retry) returns the existing PO instead of creating a duplicate.
 */
export async function createPurchaseOrderFromRfq(rfqId: string) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to create purchase orders');

  const rfq = await prisma.vendorRfq.findFirst({ where: { id: rfqId, tenantId }, include: { awardedQuote: true } });
  if (!rfq) throw new Error('RFQ not found');
  if (rfq.status !== 'awarded' || !rfq.awardedQuote) throw new Error('Award the RFQ to a vendor before raising a purchase order');

  const existing = await prisma.purchaseOrder.findFirst({ where: { vendorRfqId: rfq.id, tenantId } });
  if (existing) return existing;

  const { line, quantityAssumed } = poLineFromAward(rfq, rfq.awardedQuote);
  const lines = normalizePoLines([line]);
  const poNumber = await allocateDocNumber(tenantId, 'PO');

  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      poNumber,
      vendorId: rfq.awardedQuote.vendorId,
      vendorRfqId: rfq.id,
      incoterm: rfq.awardedQuote.incoterm,
      deliveryDate: defaultDeliveryDate(new Date(), rfq.awardedQuote.leadTimeDays),
      notes: quantityAssumed ? 'Quantity was not specified on the RFQ — confirm it before issuing.' : null,
      total: poTotal(lines),
      createdByUserId: userId,
      lines: { create: lines },
    },
  });

  await writeAudit({
    session,
    collection: 'purchase_orders',
    documentId: po.id,
    action: 'create',
    summary: `Raised ${po.poNumber} from RFQ ${rfq.rfqNumber}`,
    after: { poNumber: po.poNumber, vendorId: po.vendorId, total: po.total },
  });

  revalidatePath('/dashboard/purchase-orders');
  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return po;
}

/** Edits a draft PO's terms and lines. Once issued, the PO is what the vendor holds and is locked. */
export async function updatePurchaseOrder(poId: string, input: {
  currency?: string;
  incoterm?: string | null;
  paymentTerms?: string | null;
  /** YYYY-MM-DD, or empty to clear. */
  deliveryDate?: string | null;
  notes?: string | null;
  lines: PoLineInput[];
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to edit purchase orders');

  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, tenantId } });
  if (!po) throw new Error('Purchase order not found');
  if (!isPoEditable(po.status)) throw new Error('Only a draft purchase order can be edited');

  const lines = normalizePoLines(input.lines);
  if (lines.length === 0) throw new Error('Add at least one line');

  let deliveryDate: Date | null = null;
  if (input.deliveryDate) {
    deliveryDate = new Date(`${input.deliveryDate}T00:00:00Z`);
    if (Number.isNaN(deliveryDate.getTime())) throw new Error('Delivery date is not valid');
  }
  const currency = input.currency?.trim().toUpperCase() || po.currency;
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a 3-letter code');

  const total = poTotal(lines);
  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: poId } });
    await tx.purchaseOrder.update({
      where: { id: poId, tenantId },
      data: {
        currency,
        incoterm: input.incoterm?.trim() || null,
        paymentTerms: input.paymentTerms?.trim() || null,
        deliveryDate,
        notes: input.notes?.trim() || null,
        total,
        lines: { create: lines },
      },
    });
  });

  await writeAudit({
    session,
    collection: 'purchase_orders',
    documentId: poId,
    action: 'update',
    summary: `Edited draft ${po.poNumber} (${lines.length} line${lines.length > 1 ? 's' : ''}, total ${currency} ${total})`,
    after: { total, currency },
  });

  revalidatePath(`/dashboard/purchase-orders/${poId}`);
  revalidatePath('/dashboard/purchase-orders');
  return { total };
}

export async function setPurchaseOrderStatus(poId: string, status: PoStatus) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to change purchase orders');

  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, tenantId }, include: { lines: true } });
  if (!po) throw new Error('Purchase order not found');
  if (!canTransitionPo(po.status, status)) throw new Error(`A ${po.status} purchase order cannot become ${status}`);
  if (status === 'issued' && po.lines.length === 0) throw new Error('Add at least one line before issuing');

  await prisma.purchaseOrder.update({ where: { id: poId, tenantId }, data: { status } });

  await writeAudit({
    session,
    collection: 'purchase_orders',
    documentId: poId,
    action: 'status_change',
    summary: `${po.poNumber}: ${po.status} → ${status}`,
    before: { status: po.status },
    after: { status },
  });

  revalidatePath(`/dashboard/purchase-orders/${poId}`);
  revalidatePath('/dashboard/purchase-orders');
}
