import { requirePlatformAdmin } from '@/lib/platform/admin';
import { getSignupFunnel } from '@/lib/platform/analytics';
import { PageHeader, Card, CardHeader } from '@/components/dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  await requirePlatformAdmin();
  const funnel = await getSignupFunnel(8);

  const totalSignups = funnel.reduce((s, w) => s + w.signups, 0);
  const totalActivated = funnel.reduce((s, w) => s + w.activated, 0);
  const activationRate = totalSignups ? Math.round((totalActivated / totalSignups) * 100) : 0;
  const maxSignups = Math.max(1, ...funnel.map((w) => w.signups));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signup funnel"
        description="Weekly org signups and how many reached at least one activation step (SELF_SERVE §9)."
      />

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-muted">Signups (8w)</div>
          <div className="text-2xl font-semibold text-ink">{totalSignups}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Activated</div>
          <div className="text-2xl font-semibold text-ink">{totalActivated}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Activation rate</div>
          <div className="text-2xl font-semibold text-ink">{activationRate}%</div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Signups per week" description="Bar = signups · shaded = activated" />
        <div className="space-y-3">
          {funnel.map((w) => (
            <div key={w.weekStart.toISOString()} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted">
                {w.weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded bg-surface-2">
                <div
                  className="absolute inset-y-0 left-0 bg-brand-soft"
                  style={{ width: `${(w.signups / maxSignups) * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-brand/70"
                  style={{ width: `${(w.activated / maxSignups) * 100}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                {w.activated}/{w.signups}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
