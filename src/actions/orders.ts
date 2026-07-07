'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import type { OrderStatus } from '@prisma/client';

export async function listOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId },
    include: { quote: true, invoices: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getOrder(tenantId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { quote: true, invoices: true, buyerTracks: true },
  });
}

export async function createOrderFromQuote(quoteId: string, input: {
  orderNumber: string;
  product?: string;
  quantity?: number;
  unit?: string;
  incoterm?: string;
  destination?: string;
  originPort?: string;
  destPort?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to create orders');

  const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId } });
  if (!quote) throw new Error('Quote not found');
  if (quote.status !== 'accepted') throw new Error('Only accepted quotes can be converted to orders');

  const order = await prisma.order.create({
    data: {
      tenantId,
      orderNumber: input.orderNumber,
      product: input.product || null,
      quantity: input.quantity ?? null,
      unit: input.unit || null,
      incoterm: input.incoterm || null,
      destination: input.destination || null,
      originPort: input.originPort || null,
      destPort: input.destPort || null,
      quote: { connect: { id: quoteId } },
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
