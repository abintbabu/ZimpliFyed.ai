import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { prisma } from '@/lib/prisma';
import { complianceStatus } from '@/lib/compliance-deadlines';
import { claimableIncentiveTotal } from '@/actions/incentive-claims';

type FunnelAlert = { href: string; message: string };

/**
 * Founder-dashboard funnel-leak alerts, ported from anabyn-website: catches deals stalling
 * between stages rather than actually lost. Computed from data already needed for the counts
 * below — no extra queries beyond the three list fetches.
 */
async function funnelAlerts(tenantId: string): Promise<FunnelAlert[]> {
  const [acceptedQuotesNoOrder, shippedOrdersNoInvoice, overdueInvoices, complianceItems] = await Promise.all([
    prisma.quote.findMany({ where: { tenantId, status: 'accepted', orderId: null } }),
    prisma.order.findMany({
      where: { tenantId, status: { in: ['shipped', 'in_transit', 'delivered'] }, invoices: { none: {} } },
    }),
    prisma.invoice.findMany({
      where: { tenantId, isCreditOrDebitNote: false, balanceDue: { gt: 0 }, dueDate: { lt: new Date() } },
    }),
    prisma.complianceItem.findMany({ where: { tenantId, expiresAt: { not: null } } }),
  ]);

  const alerts: FunnelAlert[] = [];
  for (const q of acceptedQuotesNoOrder) {
    alerts.push({ href: `/dashboard/quotes/${q.id}`, message: `Quote ${q.quoteNumber} was accepted — create the order` });
  }
  for (const o of shippedOrdersNoInvoice) {
    alerts.push({ href: `/dashboard/orders/${o.id}`, message: `Order ${o.orderNumber} has shipped — bill the customer` });
  }
  if (overdueInvoices.length > 0) {
    const total = overdueInvoices.reduce((sum, i) => sum + i.balanceDue, 0);
    alerts.push({
      href: '/dashboard/invoices',
      message: `${overdueInvoices.length} overdue receivable${overdueInvoices.length > 1 ? 's' : ''} totalling ${total.toFixed(2)}`,
    });
  }
  const expiredOrExpiring = complianceItems.filter((c) => {
    const status = complianceStatus(c.expiresAt, c.renewalLeadDays);
    return status === 'expired' || status === 'expiring_soon';
  });
  for (const c of expiredOrExpiring) {
    const status = complianceStatus(c.expiresAt, c.renewalLeadDays);
    alerts.push({
      href: '/dashboard/compliance',
      message: status === 'expired' ? `${c.name} has expired — renew it` : `${c.name} expires soon — start renewal`,
    });
  }
  return alerts;
}

export default async function DashboardPage() {
  const { tenantId } = await requireTenantSession();

  const [leadCount, openTaskCount, alerts, claimableIncentives] = await Promise.all([
    prisma.lead.count({ where: { tenantId } }),
    prisma.task.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } }),
    funnelAlerts(tenantId),
    claimableIncentiveTotal(tenantId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>

      {alerts.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Attention needed</p>
          {alerts.map((a, i) => (
            <Link key={i} href={a.href} className="block text-sm text-amber-900 hover:underline">
              {a.message}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="text-sm text-muted">Leads</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{leadCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="text-sm text-muted">Open tasks</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{openTaskCount}</p>
        </div>
        <Link href="/dashboard/incentives" className="rounded-2xl border border-line bg-white p-6 hover:border-brand">
          <p className="text-sm text-muted">Incentives claimable</p>
          <p className="mt-1 text-3xl font-semibold text-amber-700">{claimableIncentives.toFixed(2)}</p>
        </Link>
      </div>
    </div>
  );
}
