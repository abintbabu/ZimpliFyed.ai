import 'server-only';
import { prisma } from './prisma';
import { realizationClock, type RealizationClock } from './realization-clock';

export type RealizationRow = { invoiceId: string; invoiceNumber: string; currency: string; clock: RealizationClock; exportDate: Date | null };

/**
 * Realisation clocks for every live export invoice with money still owed. The export date is the earliest
 * shipping-bill date (else bill-of-lading date) across the shipments carrying the invoice's order; an invoice
 * whose order has no recorded shipment date reads as `unknown`, never as on-time.
 */
export async function loadRealizationClocks(tenantId: string, now = new Date()): Promise<RealizationRow[]> {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, isDemo: false, isCreditOrDebitNote: false, status: { in: ['sent', 'partially_paid', 'overdue'] }, balanceDue: { gt: 0.01 }, orderId: { not: null } },
    select: {
      id: true, invoiceNumber: true, currency: true, total: true, balanceDue: true,
      order: { select: { shipmentOrders: { select: { shipment: { select: { shippingBillDate: true, blDate: true } } } } } },
    },
  });
  return invoices.map((i) => {
    const dates = (i.order?.shipmentOrders ?? [])
      .map((so) => so.shipment.shippingBillDate ?? so.shipment.blDate)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime());
    const exportDate = dates[0] ?? null;
    return { invoiceId: i.id, invoiceNumber: i.invoiceNumber, currency: i.currency, exportDate, clock: realizationClock({ exportDate, invoiceTotal: i.total, realized: i.total - i.balanceDue, now }) };
  });
}
