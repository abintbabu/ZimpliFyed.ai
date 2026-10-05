import 'server-only';
import { prisma } from '@/lib/prisma';
import type { MembershipRole } from '@prisma/client';
import { hasPermission } from '@/lib/permissions';
import { buildTodayQueue, type TodayItem } from '@/lib/today-queue';

/**
 * Loads the raw rows for the Today queue and ranks them. Each source is only queried when the role
 * can read it, and the result is filtered again by each row's own permission.
 */
export async function loadTodayQueue(tenantId: string, role: MembershipRole): Promise<TodayItem[]> {
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(role, p);
  const none = () => Promise.resolve([] as never[]);

  const [leads, tasks, invoices, acceptedQuotesWithoutOrder, shippedOrdersWithoutInvoice, compliance, pendingActionCount] =
    await Promise.all([
      can('leads:read')
        ? prisma.lead.findMany({
            where: { tenantId, stage: { notIn: ['In_Production', 'Shipped', 'Lost'] } },
            select: { id: true, name: true, company: true, stage: true, nextFollowUpAt: true, createdAt: true, updatedAt: true },
          })
        : none(),
      can('tasks:read')
        ? prisma.task.findMany({
            where: { tenantId, status: { in: ['open', 'in_progress'] }, dueDate: { not: null } },
            select: { id: true, title: true, status: true, dueDate: true, linkedLabel: true },
          })
        : none(),
      can('invoices:read')
        ? prisma.invoice.findMany({
            where: { tenantId, isCreditOrDebitNote: false, balanceDue: { gt: 0 }, dueDate: { not: null } },
            select: { id: true, invoiceNumber: true, status: true, dueDate: true, balanceDue: true, currency: true, isCreditOrDebitNote: true },
          })
        : none(),
      can('quotes:read')
        ? prisma.quote.findMany({
            where: { tenantId, status: 'accepted', orderId: null },
            select: { id: true, quoteNumber: true, updatedAt: true },
          })
        : none(),
      can('orders:read')
        ? prisma.order.findMany({
            where: { tenantId, status: { in: ['shipped', 'in_transit', 'delivered'] }, invoices: { none: {} } },
            select: { id: true, orderNumber: true, updatedAt: true },
          })
        : none(),
      can('compliance:read')
        ? prisma.complianceItem.findMany({
            where: { tenantId, expiresAt: { not: null } },
            select: { id: true, name: true, expiresAt: true, renewalLeadDays: true },
          })
        : none(),
      can('action_queue:read') ? prisma.actionQueueItem.count({ where: { tenantId, status: 'pending' } }) : Promise.resolve(0),
    ]);

  return buildTodayQueue({
    leads,
    tasks,
    invoices,
    acceptedQuotesWithoutOrder,
    shippedOrdersWithoutInvoice,
    compliance,
    pendingActionCount,
  }).filter((item) => hasPermission(role, item.requires));
}
