import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getUsage } from '@/lib/billing/entitlements';
import { PLANS, isUnlimited } from '@/lib/billing/plans';
import { prisma } from '@/lib/prisma';

export const metadata = { title: 'Billing & plan' };
export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const s = await requireTenantSession();
  if (!hasPermission(s.role, 'users:manage')) {
    return <p className="text-sm text-muted">Only owners and admins can manage billing.</p>;
  }

  const [usage, tenant] = await Promise.all([
    getUsage(s.tenantId),
    prisma.tenant.findUnique({ where: { id: s.tenantId }, select: { plan: true, status: true } }),
  ]);
  const ent = PLANS[usage.plan];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Billing &amp; plan</h1>
        <p className="mt-1 text-sm text-muted">Manage your subscription and see this month&apos;s usage.</p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Current plan</p>
            <p className="text-2xl font-semibold text-ink">{ent.label}</p>
            <p className="mt-1 text-xs capitalize text-muted">Status: {tenant?.status}</p>
          </div>
          <UpgradeCta plan={usage.plan} />
        </div>
      </div>

      {usage.aiSpend.capUsd != null && usage.aiSpend.usedUsd >= usage.aiSpend.capUsd && (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          You&apos;ve hit this month&apos;s AI usage budget (${usage.aiSpend.capUsd.toFixed(0)}). New AI actions are paused until next month or you upgrade your plan.
        </div>
      )}
      {usage.aiSpend.softLimitHit && usage.aiSpend.capUsd != null && usage.aiSpend.usedUsd < usage.aiSpend.capUsd && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          You&apos;ve used {Math.round((usage.aiSpend.usedUsd / usage.aiSpend.capUsd) * 100)}% of this month&apos;s AI usage budget (${usage.aiSpend.capUsd.toFixed(0)}). Consider upgrading before you hit the cap.
        </div>
      )}

      <div className="rounded-2xl border border-line bg-white p-6">
        <p className="text-sm font-semibold text-ink">This month&apos;s usage</p>
        <div className="mt-4 space-y-4">
          <Meter label="Team seats" used={usage.seats.used} limit={usage.seats.limit} />
          <Meter label="AI actions" used={usage.aiActions.used} limit={usage.aiActions.limit} />
          <Meter label="Document sets" used={usage.docSets.used} limit={usage.docSets.limit} />
          <UsdMeter label="AI spend" usedUsd={usage.aiSpend.usedUsd} capUsd={usage.aiSpend.capUsd} />
        </div>
      </div>

      <p className="text-xs text-muted">
        Payments launch soon (Razorpay for India, Stripe internationally). Need to upgrade now?{' '}
        <a href="mailto:sales@zimplifyed.ai" className="text-brand hover:underline">Talk to us</a>.
      </p>
    </div>
  );
}

function UpgradeCta({ plan }: { plan: string }) {
  if (plan === 'enterprise' || plan === 'growth') {
    return <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">All features unlocked</span>;
  }
  return (
    <Link href="mailto:sales@zimplifyed.ai" className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white">
      Upgrade
    </Link>
  );
}

function UsdMeter({ label, usedUsd, capUsd }: { label: string; usedUsd: number; capUsd: number | null }) {
  const unlimited = capUsd == null;
  const pct = unlimited ? 0 : Math.min(100, (usedUsd / Math.max(1, capUsd)) * 100);
  const over = !unlimited && usedUsd >= capUsd;
  const soft = !unlimited && !over && usedUsd >= capUsd * 0.8;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className={over ? 'font-medium text-danger' : soft ? 'font-medium text-amber-700' : 'text-muted'}>
          ${usedUsd.toFixed(2)} / {unlimited ? '∞' : `$${capUsd.toFixed(0)}`}
        </span>
      </div>
      {!unlimited && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className={`h-full ${over ? 'bg-danger' : soft ? 'bg-amber-500' : 'bg-brand-gradient'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = isUnlimited(limit);
  const pct = unlimited ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  const over = !unlimited && used >= limit;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className={over ? 'font-medium text-danger' : 'text-muted'}>
          {used} / {unlimited ? '∞' : limit}
        </span>
      </div>
      {!unlimited && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className={`h-full ${over ? 'bg-danger' : 'bg-brand-gradient'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
