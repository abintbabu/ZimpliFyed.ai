'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { writeDomainEvent } from '@/lib/domain-events';
import { allocateDocNumber } from '@/lib/doc-number-alloc';
import { normalizeOrderLines, summarizeOrderLines, type OrderLineInput } from '@/lib/order-lines';
import type { OrderStatus } from '@prisma/client';

export async function listOrders() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) throw new Error('You do not have permission to view this');
  return prisma.order.findMany({
    where: { tenantId },
    include: { quote: true, invoices: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getOrder(orderId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) throw new Error('You do not have permission to view this');
  return prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { quote: { include: { lines: true } }, invoices: true, buyerTracks: true, lines: { orderBy: { sortOrder: 'asc' } }, packingEntries: { orderBy: { sortOrder: 'asc' } } },
  });
}

/**
 * Quote → order in one step. Everything is carried over from the quote: buyer, a product summary from
 * its lines, and the total quantity. Every input is an optional override. Idempotent: an already
 * converted quote returns its existing order instead of creating a second one.
 */
export async function createOrderFromQuote(quoteId: string, input: {
  orderNumber?: string;
  product?: string;
  quantity?: number;
  unit?: string;
  incoterm?: string;
  destination?: string;
  originPort?: string;
  destPort?: string;
} = {}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to create orders');

  const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId }, include: { lines: true, buyer: true } });
  if (!quote) throw new Error('Quote not found');
  if (quote.status !== 'accepted') throw new Error('Only accepted quotes can be converted to orders');

  if (quote.orderId) {
    const existing = await prisma.order.findFirst({ where: { id: quote.orderId, tenantId } });
    if (existing) return existing;
  }

  const firstLine = quote.lines[0]?.description;
  const carriedProduct = firstLine ? (quote.lines.length > 1 ? `${firstLine} +${quote.lines.length - 1} more` : firstLine) : null;
  const totalQty = quote.lines.reduce((sum, l) => sum + l.quantity, 0);
  const orderNumber = input.orderNumber?.trim() || (await allocateDocNumber(tenantId, 'ORD'));

  const order = await prisma.order.create({
    data: {
      tenantId,
      orderNumber,
      buyerId: quote.buyerId,
      product: input.product || carriedProduct,
      quantity: input.quantity ?? (totalQty > 0 ? totalQty : null),
      unit: input.unit || null,
      incoterm: input.incoterm || null,
      destination: input.destination || quote.buyer?.country || null,
      originPort: input.originPort || null,
      destPort: input.destPort || null,
      currency: quote.currency,
      quote: { connect: { id: quoteId } },
      lines: {
        create: quote.lines.map((l, i) => ({
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          sortOrder: i,
        })),
      },
    },
  });

  await writeAudit({
    session,
    collection: 'orders',
    documentId: order.id,
    action: 'create',
    summary: `Created order ${order.orderNumber} from quote ${quote.quoteNumber}`,
    after: { orderNumber: order.orderNumber, quoteId },
  });
  await writeDomainEvent(prisma, { tenantId, type: 'order.created', refId: order.id, payload: { orderNumber: order.orderNumber, quoteId } });

  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/quotes');
  return order;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to update orders');

  const before = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
  if (!before) throw new Error('Order not found');

  // QC gate: goods whose latest inspection FAILED do not ship until a later inspection passes.
  if (status === 'shipped' || status === 'in_transit') {
    const latest = await prisma.qcInspection.findFirst({ where: { tenantId, orderId, result: { in: ['pass', 'fail'] } }, orderBy: [{ inspectedAt: 'desc' }, { createdAt: 'desc' }], select: { inspectionNumber: true, result: true } });
    if (latest?.result === 'fail') throw new Error(`The latest quality inspection (${latest.inspectionNumber}) failed — resolve it and record a passing inspection before shipping.`);
  }

  await prisma.order.update({ where: { id: orderId, tenantId }, data: { status } });

  await writeAudit({
    session,
    collection: 'orders',
    documentId: orderId,
    action: 'status_change',
    summary: `Order ${before.orderNumber} status: ${before.status} -> ${status}`,
    before: { status: before.status },
    after: { status },
  });

  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
}

/**
 * Replaces an order's line items. The header's legacy product / quantity / unit are re-derived from the
 * lines (dual-write) so every reader of the header stays correct until the contract phase.
 */
export async function saveOrderLines(orderId: string, input: { currency?: string; lines: OrderLineInput[] }) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to edit orders');

  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
  if (!order) throw new Error('Order not found');
  if (order.status === 'cancelled') throw new Error('A cancelled order cannot be edited');

  const lines = normalizeOrderLines(input.lines);
  if (lines.length === 0) throw new Error('Add at least one line with a description');
  const totals = summarizeOrderLines(lines);

  const productIds = [...new Set(lines.map((l) => l.productId).filter((id): id is string => !!id))];
  if (productIds.length) {
    const owned = await prisma.product.count({ where: { tenantId, id: { in: productIds } } });
    if (owned !== productIds.length) throw new Error('One or more products were not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderLineItem.deleteMany({ where: { orderId } });
    await tx.order.update({
      where: { id: orderId, tenantId },
      data: {
        currency: input.currency?.trim().toUpperCase() || order.currency,
        product: totals.productSummary,
        quantity: totals.totalQuantity,
        unit: totals.uom ?? order.unit,
        lines: { create: lines },
      },
    });
  });

  await writeAudit({
    session,
    collection: 'orders',
    documentId: orderId,
    action: 'update',
    summary: `Updated line items on order ${order.orderNumber} (${lines.length} line${lines.length > 1 ? 's' : ''}, total ${totals.total})`,
    after: { lines: lines.length, total: totals.total },
  });

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { lines: lines.length, total: totals.total };
}
