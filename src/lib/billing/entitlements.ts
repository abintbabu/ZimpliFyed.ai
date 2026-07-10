import 'server-only';
import { prisma } from '@/lib/prisma';
import { PLANS, isUnlimited, planHasFeature, type Feature } from './plans';
import { getAiBudgetStatus } from '@/ai/budget';
import type { TenantPlan } from '@prisma/client';

/** Thrown when a gated feature is used on a plan that doesn't include it. UI catches → upsell sheet. */
export class PlanGateError extends Error {
  constructor(public feature: Feature) {
    super(`plan_gate:${feature}`);
    this.name = 'PlanGateError';
  }
}

async function tenantPlan(tenantId: string): Promise<TenantPlan> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
  return t?.plan ?? 'free';
}

/** Guard for gated server actions. Throws PlanGateError if the tenant's plan lacks the feature. */
export async function requireFeature(tenantId: string, feature: Feature): Promise<void> {
  const plan = await tenantPlan(tenantId);
  if (!planHasFeature(plan, feature)) throw new PlanGateError(feature);
}

export type UsageSnapshot = {
  plan: TenantPlan;
  seats: { used: number; limit: number };
  aiActions: { used: number; limit: number };
  docSets: { used: number; limit: number };
  aiSpend: { usedUsd: number; capUsd: number | null; softLimitHit: boolean };
};

/** Current-month usage vs plan limits, computed from MeterEvent (AI_PLATFORM §3 rollup). */
export async function getUsage(tenantId: string): Promise<UsageSnapshot> {
  const plan = await tenantPlan(tenantId);
  const ent = PLANS[plan];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [seatsUsed, aiActions, docSets, aiSpend] = await Promise.all([
    prisma.membership.count({ where: { tenantId } }),
    prisma.meterEvent.count({ where: { tenantId, kind: 'ai_action', createdAt: { gte: monthStart } } }),
    prisma.meterEvent.count({ where: { tenantId, kind: 'doc_set', createdAt: { gte: monthStart } } }),
    getAiBudgetStatus(tenantId),
  ]);

  return {
    plan,
    seats: { used: seatsUsed, limit: ent.seats },
    aiActions: { used: aiActions, limit: ent.aiActions },
    docSets: { used: docSets, limit: ent.docSets },
    aiSpend,
  };
}

/** Seat gate at invite time. Returns whether another member can be added. */
export async function hasSeatAvailable(tenantId: string): Promise<boolean> {
  const plan = await tenantPlan(tenantId);
  const limit = PLANS[plan].seats;
  if (isUnlimited(limit)) return true;
  const pending = await prisma.invite.count({ where: { tenantId, acceptedAt: null } });
  const members = await prisma.membership.count({ where: { tenantId } });
  return members + pending < limit;
}
