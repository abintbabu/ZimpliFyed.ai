import 'server-only';
import { prisma } from '@/lib/prisma';
import type { TenantPlan } from '@prisma/client';

export class AiBudgetExceededError extends Error {
  constructor() {
    super("This month's AI usage budget has been reached. Upgrade your plan or wait until next month to continue using AI features.");
    this.name = 'AiBudgetExceededError';
  }
}

/** Monthly AI COGS cap per plan, in USD. null = unlimited (enterprise). */
export const PLAN_AI_BUDGET_USD: Record<TenantPlan, number | null> = {
  free: 5,
  starter: 50,
  growth: 300,
  enterprise: null,
};

export const AI_BUDGET_SOFT_PCT = 0.8;

function monthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getMonthlyAiSpendUsd(tenantId: string): Promise<number> {
  const agg = await prisma.aiInteraction.aggregate({
    where: { tenantId, createdAt: { gte: monthStart() } },
    _sum: { costUsd: true },
  });
  return Number(agg._sum.costUsd ?? 0);
}

export type AiBudgetStatus = {
  usedUsd: number;
  capUsd: number | null;
  softLimitHit: boolean;
};

/** Reads current spend vs plan cap. Does not throw — callers decide what to do with softLimitHit. */
export async function getAiBudgetStatus(tenantId: string): Promise<AiBudgetStatus> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
  const capUsd = PLAN_AI_BUDGET_USD[tenant?.plan ?? 'free'];
  const usedUsd = await getMonthlyAiSpendUsd(tenantId);
  return { usedUsd, capUsd, softLimitHit: capUsd != null && usedUsd >= capUsd * AI_BUDGET_SOFT_PCT };
}

/** Hard gate called by runAi before every model call. Throws once the tenant is at/over its monthly AI budget cap. */
export async function enforceAiBudget(tenantId: string): Promise<void> {
  const { usedUsd, capUsd } = await getAiBudgetStatus(tenantId);
  if (capUsd != null && usedUsd >= capUsd) throw new AiBudgetExceededError();
}
