import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye } from 'lucide-react';
import { requirePlatformAdmin } from '@/lib/platform/admin';
import { prisma } from '@/lib/prisma';
import { PageHeader, Card, CardHeader, StatCard } from '@/components/dashboard';

export const dynamic = 'force-dynamic';

/**
 * Read-only "view as tenant" surface (SELF_SERVE_PLAN §6 support impersonation).
 * Deliberately NOT the tenant's live dashboard: it's a bounded, read-only
 * snapshot rendered from platform scope, so a support session can never mutate
 * tenant data. The intent-to-view is recorded by startImpersonation() and is
 * visible in the tenant's own audit log.
 */
export default async function TenantViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformAdmin();

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
  if (!tenant) notFound();

  const [leads, quotes, orders, invoices, recentLeads, recentOrders] = await Promise.all([
    prisma.lead.count({ where: { tenantId: id } }),
    prisma.quote.count({ where: { tenantId: id } }),
    prisma.order.count({ where: { tenantId: id } }),
    prisma.invoice.count({ where: { tenantId: id } }),
    prisma.lead.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, name: true, company: true, stage: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, orderNumber: true, status: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Viewing ${tenant.name}`}
        description="Read-only support snapshot. You cannot make changes from here."
        crumbs={[{ label: 'Tenants', href: '/admin' }, { label: tenant.name, href: `/admin/tenants/${id}` }, { label: 'View' }]}
      />

      <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-2 text-xs text-warning">
        <Eye className="h-4 w-4" />
        Read-only support view — this access is logged and visible to the tenant.
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Leads" value={leads} />
        <StatCard label="Quotes" value={quotes} />
        <StatCard label="Orders" value={orders} />
        <StatCard label="Invoices" value={invoices} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent leads" />
          {recentLeads.length === 0 ? (
            <p className="text-sm text-muted">No leads.</p>
          ) : (
            <div className="divide-y divide-line-soft text-sm">
              {recentLeads.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2">
                  <span className="text-ink">
                    {l.name}
                    {l.company && <span className="ml-1 text-xs text-muted">· {l.company}</span>}
                  </span>
                  <span className="text-xs text-muted">{l.stage.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent orders" />
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted">No orders.</p>
          ) : (
            <div className="divide-y divide-line-soft text-sm">
              {recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-2">
                  <span className="text-ink">{o.orderNumber ?? o.id.slice(0, 8)}</span>
                  <span className="text-xs text-muted">{o.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Link href={`/admin/tenants/${id}`} className="inline-block text-sm text-brand hover:underline">
        ← Back to tenant admin
      </Link>
    </div>
  );
}
