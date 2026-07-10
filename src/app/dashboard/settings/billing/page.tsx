import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getUsage } from '@/lib/billing/entitlements';
import { PLANS, isUnlimited } from '@/lib/billing/plans';
import { prisma } from '@/lib/prisma';
import { UpgradeButton, ManageBillingButton, BuyOverageButton } from './billing-actions';
import type { TenantPlan } from '@prisma/client';

export const metadata = { title: 'Billing & plan' };
export const dynamic = 'force-dynamic';

const UPGRADE_ORDER: Exclude<TenantPlan, 'free'>[] = ['starter', 'growth', 'enterprise'];

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default async function BillingPage() {
  const s = await requireTenantSession();
  if (!hasPermission(s.role, 'users:manage')) {
    return <p className="text-sm text-muted">Only owners and admins can manage billing.</p>;
  }

  const [usage, tenant] = await Promise.all([
    getUsage(s.tenantId),
    prisma.tenant.findUnique({
      where: { id: s.tenantId },
      select: { plan: true, status: true, billingProvider: true, trialEndsAt: true, currentPeriodEnd: true },
    }),
  ]);
  const ent = PLANS[usage.plan];
  const hasLiveSubscription = tenant?.billingProvider === 'stripe';
  const trialDaysLeft = daysUntil(tenant?.trialEndsAt);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Billing &amp; plan</h1>
        <p className="mt-1 text-sm text-muted">Manage your subscription and see this month&apos;s usage.</p>
      </div>

      {tenant?.status === 'trial' && trialDaysLeft != null && (
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 text-sm text-ink">
          {trialDaysLeft > 0
            ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in your trial with full Business features. Add a plan to keep them after it ends.`
            : 'Your trial ends today — add a plan to keep Business features, or you\'ll drop to Free automatically.'}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Current plan</p>
            <p className="text-2xl font-semibold text-ink">{ent.label}</p>
            <p className="mt-1 text-xs capitalize text-muted">
              Status: {tenant?.status}
              {tenant?.currentPeriodEnd ? ` · renews ${tenant.currentPeriodEnd.toLocaleDateString()}` : ''}
            </p>
          </div>
          {hasLiveSubscription ? <ManageBillingButton /> : usage.plan !== 'enterprise' && <UpgradeButton plan="growth" label="Upgrade" />}
        </div>
      </div>

      {!hasLiveSubscription && (
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-semibold text-ink">Plans</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {UPGRADE_ORDER.map((plan) => (
              <div key={plan} className="rounded-xl border border-line p-4">
                <p className="text-sm font-semibold text-ink">{PLANS[plan].label}</p>
                <p className="mt-1 text-xs text-muted">
                  {isUnlimited(PLANS[plan].seats) ? 'Unlimited seats' : `${PLANS[plan].seats} seats`} · {PLANS[plan].aiActions} AI actions/mo
                </p>
                <div className="mt-3">
                  <UpgradeButton plan={plan} label={plan === usage.plan ? 'Current plan' : `Choose ${PLANS[plan].label}`} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Not sure which plan? <a href="mailto:sales@zimplifyed.ai" className="text-brand hover:underline">Talk to us</a>.
          </p>
        </div>
      )}

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
          <div>
            <Meter label="AI actions" used={usage.aiActions.used} limit={usage.aiActions.limit} />
            {!isUnlimited(usage.aiActions.limit) && usage.aiActions.used >= usage.aiActions.limit && (
              <div className="mt-1.5"><BuyOverageButton pack="ai_actions" label="Buy 100 more AI actions" /></div>
            )}
          </div>
          <div>
            <Meter label="Document sets" used={usage.docSets.used} limit={usage.docSets.limit} />
            {!isUnlimited(usage.docSets.limit) && usage.docSets.used >= usage.docSets.limit && (
              <div className="mt-1.5"><BuyOverageButton pack="doc_sets" label="Buy 10 more document sets" /></div>
            )}
          </div>
          <UsdMeter label="AI spend" usedUsd={usage.aiSpend.usedUsd} capUsd={usage.aiSpend.capUsd} />
        </div>
      </div>

      <p className="text-xs text-muted">
        Need a data export or want to close your account? See{' '}
        <Link href="/dashboard/settings/export" className="text-brand hover:underline">Export data</Link>.
      </p>
    </div>
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
