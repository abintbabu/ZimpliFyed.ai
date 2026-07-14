import 'server-only';
import { prisma } from '@/lib/prisma';
import { MONTHLY_INR, PLANS } from '@/lib/billing/plans';
import type { TenantPlan, TenantStatus } from '@prisma/client';

/** The five onboarding steps computeChecklist() stamps into Tenant.onboarding. */
const ACTIVATION_STEPS = ['complianceFilled', 'teammateInvited', 'firstQuote', 'leadsImported', 'copilotUsed'] as const;

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  memberCount: number;
  aiActions30d: number;
  activationPct: number;
  mrrInr: number;
  createdAt: Date;
};

export function fmtInr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

/** MRR contribution of a tenant: only paying, live plans count (enterprise = custom → 0 here). */
export function tenantMrrInr(plan: TenantPlan, status: TenantStatus): number {
  if (status !== 'active') return 0;
  const price = MONTHLY_INR[plan];
  return price > 0 ? price : 0;
}

function activationPct(onboarding: unknown): number {
  const stamped = (onboarding ?? {}) as Record<string, unknown>;
  const done = ACTIVATION_STEPS.filter((s) => !!stamped[s]).length;
  return Math.round((done / ACTIVATION_STEPS.length) * 100);
}

/** Tenant list for the console home, ordered newest-first, with health signals. */
export async function listTenantSummaries(): Promise<TenantSummary[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const tenants = await prisma.tenant.findMany({
    where: { status: { not: 'deleted' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      status: true,
      onboarding: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
  });

  const usage = await prisma.meterEvent.groupBy({
    by: ['tenantId'],
    where: { kind: 'ai_action', createdAt: { gte: since } },
    _sum: { quantity: true },
  });
  const usageByTenant = new Map(usage.map((u) => [u.tenantId, u._sum.quantity ?? 0]));

  return tenants.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    plan: t.plan,
    status: t.status,
    memberCount: t._count.memberships,
    aiActions30d: usageByTenant.get(t.id) ?? 0,
    activationPct: activationPct(t.onboarding),
    mrrInr: tenantMrrInr(t.plan, t.status),
    createdAt: t.createdAt,
  }));
}

export type PlatformOverview = {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  totalMrrInr: number;
  aiActions30d: number;
};

export async function getPlatformOverview(summaries: TenantSummary[]): Promise<PlatformOverview> {
  return {
    totalTenants: summaries.length,
    activeTenants: summaries.filter((s) => s.status === 'active').length,
    trialTenants: summaries.filter((s) => s.status === 'trial').length,
    suspendedTenants: summaries.filter((s) => s.status === 'suspended').length,
    totalMrrInr: summaries.reduce((sum, s) => sum + s.mrrInr, 0),
    aiActions30d: summaries.reduce((sum, s) => sum + s.aiActions30d, 0),
  };
}

export type SignupFunnel = {
  weekStart: Date;
  signups: number;
  activated: number; // reached ≥1 activation step
}[];

/** Signups per week for the last N weeks + how many activated (§6 signup funnel). */
export async function getSignupFunnel(weeks = 8): Promise<SignupFunnel> {
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
  const tenants = await prisma.tenant.findMany({
    where: { createdAt: { gte: since }, status: { not: 'deleted' } },
    select: { createdAt: true, onboarding: true },
  });

  const buckets = new Map<number, { signups: number; activated: number }>();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const origin = Math.floor(since.getTime() / weekMs) * weekMs;

  for (let i = 0; i < weeks; i++) buckets.set(origin + i * weekMs, { signups: 0, activated: 0 });

  for (const t of tenants) {
    const key = Math.floor(t.createdAt.getTime() / weekMs) * weekMs;
    const b = buckets.get(key);
    if (!b) continue;
    b.signups += 1;
    if (activationPct(t.onboarding) > 0) b.activated += 1;
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, v]) => ({ weekStart: new Date(week), signups: v.signups, activated: v.activated }));
}

export type TenantDetail = Awaited<ReturnType<typeof getTenantDetail>>;

/** Full detail for one tenant's admin page. Uses raw prisma (platform scope). */
export async function getTenantDetail(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      memberships: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { name: true, email: true, platformRole: true } } },
      },
    },
  });
  if (!tenant) return null;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [usage, platformAudit] = await Promise.all([
    prisma.meterEvent.groupBy({
      by: ['kind'],
      where: { tenantId, createdAt: { gte: since } },
      _sum: { quantity: true },
    }),
    prisma.platformAuditEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    tenant,
    plan: PLANS[tenant.plan],
    mrrInr: tenantMrrInr(tenant.plan, tenant.status),
    activationPct: activationPct(tenant.onboarding),
    usage30d: usage.map((u) => ({ kind: u.kind, quantity: u._sum.quantity ?? 0 })),
    platformAudit,
  };
}
