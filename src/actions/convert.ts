'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { allocateDocNumber } from '@/lib/doc-number-alloc';
import { convertLeadToBuyer } from '@/actions/buyers';

/**
 * One-click conversions down the deal chain: lead → quote (here), quote → order
 * (`createOrderFromQuote`), order → invoice (here). Each carries the data forward, links the records
 * both ways and is idempotent, so a double click lands on the existing record, never a duplicate.
 */

/** Lead → draft quote. Converts the lead to a buyer first when it isn't one yet. */
export async function convertLeadToQuote(leadId: string): Promise<{ id: string }> {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to create quotes');

  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
  if (!lead) throw new Error('Lead not found');

  const existing = await prisma.quote.findFirst({
    where: { tenantId, leadId, status: 'draft' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (existing) return existing;

  const buyerId = lead.convertedBuyerId ?? (await convertLeadToBuyer(leadId));
  const buyer = await prisma.buyer.findFirst({ where: { id: buyerId, tenantId }, select: { currencyDefault: true } });

  const quote = await prisma.quote.create({
    data: {
      tenantId,
      quoteNumber: await allocateDocNumber(tenantId, 'QT'),
      leadId,
      buyerId,
      currency: buyer?.currencyDefault ?? 'USD',
    },
  });

  await writeAudit({
    session,
    collection: 'quotes',
    documentId: quote.id,
    action: 'create',
    summary: `Created quote ${quote.quoteNumber} from lead ${lead.name}`,
    after: { quoteNumber: quote.quoteNumber, leadId, buyerId },
  });

  revalidatePath('/dashboard/quotes');
  revalidatePath('/dashboard/leads');
  return { id: quote.id };
}

/**
 * Order → draft invoice, copying the quote's lines and currency. Returns the order's existing draft
 * invoice if there is one. With no quote lines the draft is empty and gets filled in on the invoice page.
 */
export async function createInvoiceFromOrder(orderId: string): Promise<{ id: string }> {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to create invoices');

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { quote: { include: { lines: true } } },
  });
  if (!order) throw new Error('Order not found');

  const existing = await prisma.invoice.findFirst({
    where: { tenantId, orderId, status: 'draft', isCreditOrDebitNote: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (existing) return existing;

  const lines = (order.quote?.lines ?? []).map((l) => ({
    productId: l.productId,
    description: l.description,
    quantity: l.quantity,
    cost: l.cost,
    expensePct: l.expensePct,
    marginPct: l.marginPct,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
  }));
  const total = parseFloat(lines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(2));

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber: await allocateDocNumber(tenantId, 'INV'),
      orderId,
      currency: order.quote?.currency ?? 'USD',
      total,
      balanceDue: total,
      lines: { create: lines },
    },
  });

  await writeAudit({
    session,
    collection: 'invoices',
    documentId: invoice.id,
    action: 'create',
    summary: `Created invoice ${invoice.invoiceNumber} from order ${order.orderNumber}`,
    after: { invoiceNumber: invoice.invoiceNumber, orderId, total },
  });

  revalidatePath('/dashboard/invoices');
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { id: invoice.id };
}
