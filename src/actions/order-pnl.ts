'use server';

import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { computeOrderPnl } from '@/lib/order-pnl';

export async function getOrderPnl(orderId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) throw new Error('You do not have permission to view this order');

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      quote: { include: { lines: true, costSheet: { include: { lines: true } } } },
      invoices: true,
    },
  });
  if (!order) throw new Error('Order not found');

  const incentiveClaims = await prisma.incentiveClaim.findMany({
    where: { tenantId, orderId, status: { in: ['claimed', 'received'] } },
  });

  // Snapped expenses attributed to this order that have been booked (auto-posted or human-approved).
  const bookedExpenses = await prisma.expense.findMany({
    where: { tenantId, orderId, status: { in: ['auto_posted', 'approved'] }, amount: { not: null } },
    select: { amount: true },
  });

  return computeOrderPnl({
    quote: order.quote ? { total: order.quote.total, lines: order.quote.lines } : null,
    costSheet: order.quote?.costSheet
      ? {
          incoterm: order.quote.costSheet.incoterm,
          sellPricePerUnit: order.quote.costSheet.sellPricePerUnit,
          rodtepPct: order.quote.costSheet.rodtepPct,
          lines: order.quote.costSheet.lines,
        }
      : null,
    invoices: order.invoices.map((i) => ({ total: i.total, isCreditOrDebitNote: i.isCreditOrDebitNote })),
    incentiveAmounts: incentiveClaims.map((c) => c.amount),
    bookedExpenses: bookedExpenses.map((e) => e.amount!),
  });
}
