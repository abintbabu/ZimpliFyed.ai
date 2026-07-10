import { PLANS, type Feature } from './plans';
import type { TenantPlan } from '@prisma/client';

const PLAN_GATE_PREFIX = 'plan_gate:';

/** Client-safe counterpart to PlanGateError (entitlements.ts) — server actions can't send typed errors across
 * the RSC boundary, so PlanGateError's message is the wire format (`plan_gate:${feature}`) and this parses it back. */
export function parsePlanGateError(err: unknown): Feature | null {
  if (!(err instanceof Error)) return null;
  if (!err.message.startsWith(PLAN_GATE_PREFIX)) return null;
  return err.message.slice(PLAN_GATE_PREFIX.length) as Feature;
}

const PLAN_ORDER: TenantPlan[] = ['free', 'starter', 'growth', 'enterprise'];

export function cheapestPlanWithFeature(feature: Feature): TenantPlan | null {
  return PLAN_ORDER.find((plan) => PLANS[plan].features.includes(feature)) ?? null;
}
