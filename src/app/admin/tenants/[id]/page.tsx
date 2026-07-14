import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/platform/admin';
import { getTenantDetail, fmtInr } from '@/lib/platform/analytics';
import { listTenantFlags } from '@/lib/feature-flags';
import { ROLE_LABELS } from '@/lib/permissions';
import { PageHeader, Card, CardHeader, Badge, type BadgeTone } from '@/components/dashboard';
import { FeatureFlagControls, LifecycleControls } from './tenant-controls';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, BadgeTone> = {
  trial: 'info',
  active: 'success',
  past_due: 'warning',
  suspended: 'danger',
  pending_deletion: 'danger',
  deleted: 'neutral',
};

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformAdmin();

  const detail = await getTenantDetail(id);
  if (!detail) notFound();
  const flags = await listTenantFlags(id);
  const { tenant, plan, mrrInr, activationPct, usage30d, platformAudit } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant.name}
        description={`/${tenant.slug} · ${plan.label} plan`}
        crumbs={[{ label: 'Tenants', href: '/admin' }, { label: tenant.name }]}
        actions={<Badge tone={STATUS_TONE[tenant.status] ?? 'neutral'}>{tenant.status.replace('_', ' ')}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Snapshot" />
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">MRR</dt>
                <dd className="font-medium text-ink">{mrrInr ? fmtInr(mrrInr) : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Activation</dt>
                <dd className="font-medium text-ink">{activationPct}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Seats</dt>
                <dd className="font-medium text-ink">
                  {tenant.memberships.length}
                  {plan.seats > 0 ? ` / ${plan.seats}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Signed up</dt>
                <dd className="font-medium text-ink">{tenant.createdAt.toLocaleDateString()}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Members" description={`${tenant.memberships.length} member(s)`} />
            <div className="divide-y divide-line-soft">
              {tenant.memberships.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="text-ink">{m.user.name ?? m.user.email}</span>
                    <span className="ml-2 text-xs text-muted">{m.user.email}</span>
                    {m.user.platformRole === 'platform_admin' && (
                      <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand">staff</span>
                    )}
                  </div>
                  <Badge tone="neutral">{ROLE_LABELS[m.role]}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="AI usage (30d)" description="Metered events by kind" />
            {usage30d.length === 0 ? (
              <p className="text-sm text-muted">No metered activity in the last 30 days.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {usage30d.map((u) => (
                  <div key={u.kind} className="rounded-xl border border-line-soft p-3">
                    <div className="text-xs text-muted">{u.kind.replace('_', ' ')}</div>
                    <div className="text-lg font-semibold tabular-nums text-ink">{u.quantity}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Platform access log" description="Impersonation & lifecycle actions on this tenant" />
            {platformAudit.length === 0 ? (
              <p className="text-sm text-muted">No platform actions recorded.</p>
            ) : (
              <div className="divide-y divide-line-soft text-sm">
                {platformAudit.map((e) => (
                  <div key={e.id} className="py-2">
                    <div className="text-ink">{e.summary}</div>
                    <div className="text-xs text-muted">
                      {e.actorEmail} · {e.createdAt.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Feature flags" description="Overrides win; otherwise the code default applies." />
            <FeatureFlagControls tenantId={tenant.id} flags={flags} />
          </Card>

          <Card>
            <CardHeader title="Lifecycle & access" description="Every action here is audited and visible to the tenant." />
            <LifecycleControls tenantId={tenant.id} status={tenant.status} slug={tenant.slug} />
          </Card>
        </div>
      </div>
    </div>
  );
}
