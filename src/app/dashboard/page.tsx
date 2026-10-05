import Link from 'next/link';
import { AlertTriangle, PiggyBank, Users2, CheckSquare, Package, ArrowRight } from 'lucide-react';
import { auth } from '@/auth';
import { requireTenantSession } from '@/lib/session-tenant';
import { TenantSwitcher } from '@/components/onboarding/tenant-switcher';
import { prisma } from '@/lib/prisma';
import { loadTodayQueue } from '@/lib/today-loader';
import { claimableIncentiveTotal } from '@/actions/incentive-claims';
import { computeChecklist } from '@/actions/onboarding';
import { OnboardingChecklistCard } from '@/components/onboarding/checklist-card';
import { DemoDataBanner } from '@/components/onboarding/demo-banner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardHeader } from '@/components/dashboard/card';
import { hasPermission } from '@/lib/permissions';

export default async function DashboardPage() {
  const { tenantId, role } = await requireTenantSession();
  const session = await auth();
  const memberships = session?.user?.memberships ?? [];
  const activeSlug = memberships.find((m) => m.tenantId === tenantId)?.tenantSlug ?? '';

  const canReadLeads = hasPermission(role, 'leads:read');
  const canReadTasks = hasPermission(role, 'tasks:read');
  const canReadIncentives = hasPermission(role, 'incentives:read');
  const canReadOrders = hasPermission(role, 'orders:read');

  const [leadCount, openTaskCount, todayItems, claimableIncentives, orderCount, checklist, demoCount] =
    await Promise.all([
      canReadLeads ? prisma.lead.count({ where: { tenantId } }) : Promise.resolve(0),
      canReadTasks
        ? prisma.task.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } })
        : Promise.resolve(0),
      loadTodayQueue(tenantId, role),
      canReadIncentives ? claimableIncentiveTotal(tenantId) : Promise.resolve(0),
      canReadOrders
        ? prisma.order.count({ where: { tenantId, status: { in: ['confirmed', 'in_production', 'shipped', 'in_transit'] } } })
        : Promise.resolve(0),
      computeChecklist(tenantId),
      prisma.lead.count({ where: { tenantId, isDemo: true } }),
    ]);

  const showOrdersCard = canReadOrders && (!canReadLeads || !canReadIncentives);

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
        {canReadLeads && <StatCard label="Leads" value={leadCount} icon={Users2} href="/dashboard/leads" />}
        {canReadTasks && <StatCard label="Open tasks" value={openTaskCount} icon={CheckSquare} href="/dashboard/tasks" />}
        {canReadIncentives && (
          <StatCard
            label="Incentives claimable"
            value={claimableIncentives.toFixed(2)}
            icon={PiggyBank}
            tone="warning"
            href="/dashboard/incentives"
          />
        )}
        {showOrdersCard && (
          <StatCard label="Active orders" value={orderCount} icon={Package} href="/dashboard/orders" />
        )}
      </div>

      {todayItems.length > 0 && (
        <Card padded={false}>
          <div className="border-b border-line-soft px-5 py-4">
            <CardHeader
              title="Today"
              description={`${todayItems.length} item${todayItems.length > 1 ? 's' : ''} need${todayItems.length > 1 ? '' : 's'} you, most urgent first`}
            />
          </div>
          <div className="divide-y divide-line-soft">
            {todayItems.slice(0, 12).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="group flex items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-warning-soft"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    item.severity === 'overdue' ? 'bg-warning-soft text-warning' : 'bg-surface text-muted'
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">
                  <span className="block text-ink-soft group-hover:text-ink">{item.title}</span>
                  <span className="block text-xs text-muted">{item.subtitle}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
          {todayItems.length > 12 && (
            <p className="border-t border-line-soft px-5 py-3 text-xs text-muted">+{todayItems.length - 12} more</p>
          )}
        </Card>
      )}
    </div>
  );
}
