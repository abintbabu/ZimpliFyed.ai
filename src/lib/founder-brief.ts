import 'server-only';
import { prisma } from './prisma';
import { complianceStatus } from './compliance-deadlines';
import { lcDeadlineAlerts } from './lc-deadlines';
import { loadRealizationClocks } from './realization-loader';

export type BriefItem = { severity: 'urgent' | 'attention' | 'info'; text: string; href?: string };
export type FounderBrief = {
  generatedAt: Date;
  headline: string;
  cash: { overdueReceivables: number; overdueCount: number; outstandingReceivables: number };
  items: BriefItem[];
};

/**
 * The "daily founder brief" (PRODUCT_PLAN Phase 3 gap): a single digest of what
 * needs a decision today — money at risk, deals stalling, deadlines closing —
 * assembled from data the app already holds. No AI required; deterministic.
 */
export async function buildFounderBrief(tenantId: string): Promise<FounderBrief> {
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 86_400_000);

  const [openInvoices, followUps, acceptedNoOrder, shippedNoInvoice, compliance, claimable, openLcs] = await Promise.all([
    prisma.invoice.findMany({ where: { tenantId, isDemo: false, isCreditOrDebitNote: false, balanceDue: { gt: 0 } } }),
    prisma.lead.findMany({ where: { tenantId, isDemo: false, nextFollowUpAt: { lte: soon } }, orderBy: { nextFollowUpAt: 'asc' } }),
    prisma.quote.findMany({ where: { tenantId, isDemo: false, status: 'accepted', orderId: null } }),
    prisma.order.findMany({ where: { tenantId, isDemo: false, status: { in: ['shipped', 'in_transit', 'delivered'] }, invoices: { none: {} } } }),
    prisma.complianceItem.findMany({ where: { tenantId, expiresAt: { not: null } } }),
    prisma.incentiveClaim.findMany({ where: { tenantId, status: 'claimable' } }).catch(() => []),
    prisma.letterOfCredit.findMany({
      where: { tenantId, status: { in: ['draft', 'advised', 'amended'] }, OR: [{ expiryDate: { not: null } }, { latestShipmentDate: { not: null } }] },
      include: { order: { select: { id: true, orderNumber: true, status: true } } },
    }),
  ]);

  const overdue = openInvoices.filter((i) => i.dueDate && i.dueDate < now);
  const overdueReceivables = overdue.reduce((s, i) => s + i.balanceDue, 0);
  const outstandingReceivables = openInvoices.reduce((s, i) => s + i.balanceDue, 0);

  const items: BriefItem[] = [];

  if (overdue.length > 0) {
    items.push({ severity: 'urgent', href: '/dashboard/invoices', text: `${overdue.length} overdue receivable${overdue.length > 1 ? 's' : ''} totalling ${overdueReceivables.toFixed(2)} — chase payment.` });
  }
  for (const l of followUps.slice(0, 5)) {
    const overdueFollow = l.nextFollowUpAt && l.nextFollowUpAt < now;
    items.push({ severity: overdueFollow ? 'urgent' : 'attention', href: '/dashboard/leads', text: `${overdueFollow ? 'Overdue: ' : ''}Follow up with ${l.name}${l.company ? ` (${l.company})` : ''}.` });
  }
  for (const q of acceptedNoOrder) {
    items.push({ severity: 'attention', href: `/dashboard/quotes/${q.id}`, text: `Quote ${q.quoteNumber} was accepted — convert it to an order.` });
  }
  for (const o of shippedNoInvoice) {
    items.push({ severity: 'attention', href: `/dashboard/orders/${o.id}`, text: `Order ${o.orderNumber} shipped but isn't invoiced — bill the customer.` });
  }
  for (const c of compliance) {
    const st = complianceStatus(c.expiresAt, c.renewalLeadDays);
    if (st === 'expired') items.push({ severity: 'urgent', href: '/dashboard/compliance', text: `${c.name} has expired — renew before your next shipment.` });
    else if (st === 'expiring_soon') items.push({ severity: 'attention', href: '/dashboard/compliance', text: `${c.name} expires soon — start the renewal.` });
  }
  for (const lc of openLcs) {
    const shipped = ['shipped', 'in_transit', 'delivered'].includes(lc.order.status);
    for (const a of lcDeadlineAlerts(lc, shipped, now)) {
      const label = a.kind === 'shipment' ? 'latest shipment date' : 'expiry';
      const when = a.overdue ? `passed ${-a.daysLeft}d ago` : a.daysLeft === 0 ? 'is today' : `in ${a.daysLeft}d`;
      items.push({
        severity: a.severity,
        href: `/dashboard/orders/${lc.order.id}`,
        text: `LC ${label} for order ${lc.order.orderNumber} ${when}${a.kind === 'shipment' ? ' — ship in time or request an amendment.' : ' — present documents before it lapses.'}`,
      });
    }
  }
  // Export proceeds must be realised within the FEMA period from the date of export (advisory — confirm with your AD bank).
  for (const r of (await loadRealizationClocks(tenantId, now)).filter((x) => x.clock.status === 'overdue' || x.clock.status === 'due_soon').slice(0, 5)) {
    const c = r.clock;
    items.push({
      severity: c.status === 'overdue' ? 'urgent' : 'attention',
      href: `/dashboard/invoices/${r.invoiceId}`,
      text: c.status === 'overdue'
        ? `Export proceeds on ${r.invoiceNumber} are ${-(c.daysLeft ?? 0)} day(s) past the realisation period — talk to your bank.`
        : `Export proceeds on ${r.invoiceNumber} fall due for realisation in ${c.daysLeft} day(s).`,
    });
  }
  const claimableTotal = (claimable as { amount?: number | null }[]).reduce((s, c) => s + (c.amount ?? 0), 0);
  if (claimableTotal > 0) {
    items.push({ severity: 'info', href: '/dashboard/incentives', text: `${claimableTotal.toFixed(2)} in export incentives are claimable.` });
  }

  const urgent = items.filter((i) => i.severity === 'urgent').length;
  const headline = items.length === 0
    ? 'All clear — nothing needs a decision today.'
    : urgent > 0
      ? `${urgent} urgent item${urgent > 1 ? 's' : ''} need${urgent > 1 ? '' : 's'} attention today.`
      : `${items.length} thing${items.length > 1 ? 's' : ''} to move forward today.`;

  return {
    generatedAt: now,
    headline,
    cash: { overdueReceivables, overdueCount: overdue.length, outstandingReceivables },
    items,
  };
}
