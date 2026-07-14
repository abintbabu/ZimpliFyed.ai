import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { requirePlatformAdmin } from '@/lib/platform/admin';
import { prisma } from '@/lib/prisma';
import { PageHeader, DataTable, EmptyState, Badge, type DataTableColumn, type BadgeTone } from '@/components/dashboard';

export const dynamic = 'force-dynamic';

const ACTION_TONE: Record<string, BadgeTone> = {
  impersonate_start: 'info',
  feature_flag_set: 'brand',
  tenant_suspend: 'danger',
  tenant_reactivate: 'success',
  slug_reclaim: 'warning',
  plan_override: 'warning',
};

export default async function PlatformAuditPage() {
  await requirePlatformAdmin();

  const entries = await prisma.platformAuditEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  type Entry = (typeof entries)[number];

  const columns: DataTableColumn<Entry>[] = [
    { key: 'when', header: 'When', className: 'whitespace-nowrap', render: (e) => e.createdAt.toLocaleString() },
    { key: 'actor', header: 'Actor', render: (e) => <span className="text-ink">{e.actorEmail}</span> },
    {
      key: 'action',
      header: 'Action',
      render: (e) => <Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{e.action.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'tenant',
      header: 'Tenant',
      render: (e) =>
        e.tenantId ? (
          <Link href={`/admin/tenants/${e.tenantId}`} className="text-brand hover:underline">
            {e.tenantSlug ?? e.tenantId.slice(0, 8)}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'summary', header: 'Summary', render: (e) => <span className="text-ink-soft">{e.summary}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Platform audit log" description="Every platform-staff action across all tenants." />
      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(e) => e.id}
        empty={<EmptyState icon={ScrollText} title="No platform actions yet" description="Impersonation, flags, and lifecycle actions appear here." />}
      />
    </div>
  );
}
