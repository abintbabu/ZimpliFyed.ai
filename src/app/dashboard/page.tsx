import Link from 'next/link';
import { AlertTriangle, PiggyBank, Users2, CheckSquare, ArrowRight } from 'lucide-react';
import { auth } from '@/auth';
import { requireTenantSession } from '@/lib/session-tenant';
import { TenantSwitcher } from '@/components/onboarding/tenant-switcher';
import { prisma } from '@/lib/prisma';
import { complianceStatus } from '@/lib/compliance-deadlines';
import { claimableIncentiveTotal } from '@/actions/incentive-claims';
import { computeChecklist } from '@/actions/onboarding';
import { OnboardingChecklistCard } from '@/components/onboarding/checklist-card';
import { DemoDataBanner } from '@/components/onboarding/demo-banner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardHeader } from '@/components/dashboard/card';

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
  const session = await auth();
  const memberships = session?.user?.memberships ?? [];
  const activeSlug = memberships.find((m) => m.tenantId === tenantId)?.tenantSlug ?? '';

  const [leadCount, openTaskCount, alerts, claimableIncentives, checklist, demoCount] = await Promise.all([
    prisma.lead.count({ where: { tenantId } }),
    prisma.task.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } }),
    funnelAlerts(tenantId),
    claimableIncentiveTotal(tenantId),
    computeChecklist(tenantId),
    prisma.lead.count({ where: { tenantId, isDemo: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your export operation at a glance."
        actions={<TenantSwitcher memberships={memberships} activeSlug={activeSlug} />}
      />

      {demoCount > 0 && <DemoDataBanner />}

      <OnboardingChecklistCard state={checklist} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Leads" value={leadCount} icon={Users2} href="/dashboard/leads" />
        <StatCard label="Open tasks" value={openTaskCount} icon={CheckSquare} href="/dashboard/tasks" />
        <StatCard
          label="Incentives claimable"
          value={claimableIncentives.toFixed(2)}
          icon={PiggyBank}
          tone="warning"
          href="/dashboard/incentives"
        />
      </div>

      {alerts.length > 0 && (
        <Card padded={false}>
          <div className="border-b border-line-soft px-5 py-4">
            <CardHeader
              title="Needs attention"
              description={`${alerts.length} item${alerts.length > 1 ? 's' : ''} stalling in the pipeline`}
            />
          </div>
          <div className="divide-y divide-line-soft">
            {alerts.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className="group flex items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-warning-soft"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-ink-soft group-hover:text-ink">{a.message}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
