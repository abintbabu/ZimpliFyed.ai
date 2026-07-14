import Link from 'next/link';
import { Building2, Wallet, Users2, Sparkles } from 'lucide-react';
import { requirePlatformAdmin } from '@/lib/platform/admin';
import { listTenantSummaries, getPlatformOverview, fmtInr, type TenantSummary } from '@/lib/platform/analytics';
import { PageHeader, StatCard, DataTable, Badge, EmptyState, type DataTableColumn, type BadgeTone } from '@/components/dashboard';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, BadgeTone> = {
  trial: 'info',
  active: 'success',
  past_due: 'warning',
  suspended: 'danger',
  pending_deletion: 'danger',
  deleted: 'neutral',
};

export default async function AdminHome() {
  await requirePlatformAdmin();
  const summaries = await listTenantSummaries();
  const overview = await getPlatformOverview(summaries);

  const columns: DataTableColumn<TenantSummary>[] = [
    {
      key: 'name',
      header: 'Tenant',
      render: (t) => (
        <Link href={`/admin/tenants/${t.id}`} className="block min-w-0 group">
          <div className="truncate font-medium text-ink group-hover:text-brand">{t.name}</div>
          <div className="text-xs text-muted">/{t.slug}</div>
        </Link>
      ),
    },
    { key: 'plan', header: 'Plan', render: (t) => <span className="capitalize">{t.plan}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{t.status.replace('_', ' ')}</Badge>,
    },
    { key: 'members', header: 'Seats', className: 'text-right tabular-nums', render: (t) => t.memberCount },
    {
      key: 'activation',
      header: 'Activation',
      className: 'text-right tabular-nums',
      render: (t) => (
        <span className={t.activationPct >= 60 ? 'text-success' : t.activationPct > 0 ? 'text-warning' : 'text-muted'}>
          {t.activationPct}%
        </span>
      ),
    },
    { key: 'ai', header: 'AI 30d', className: 'text-right tabular-nums', render: (t) => t.aiActions30d },
    { key: 'mrr', header: 'MRR', className: 'text-right tabular-nums', render: (t) => (t.mrrInr ? fmtInr(t.mrrInr) : '—') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Tenants" description="Every organization on Zimplifyed. Health signals update live." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tenants" value={overview.totalTenants} icon={Building2} />
        <StatCard label="Active / trial" value={`${overview.activeTenants} / ${overview.trialTenants}`} icon={Users2} tone="success" />
        <StatCard label="MRR" value={fmtInr(overview.totalMrrInr)} icon={Wallet} tone="success" />
        <StatCard label="AI actions (30d)" value={overview.aiActions30d} icon={Sparkles} />
      </div>

      <DataTable
        columns={columns}
        rows={summaries}
        rowKey={(t) => t.id}
        empty={<EmptyState icon={Building2} title="No tenants yet" description="Organizations will appear here as people sign up." />}
      />

      {overview.suspendedTenants > 0 && (
        <p className="text-xs text-muted">
          {overview.suspendedTenants} suspended tenant(s).{' '}
          <Link href="/admin/audit" className="text-brand hover:underline">See platform audit log</Link>.
        </p>
      )}
    </div>
  );
}
