import type { TenantPlan } from '@prisma/client';

export type Feature =
  | 'core'
  | 'doc_generator'
  | 'rfq_broadcast'
  | 'compliance_vault'
  | 'lc_advisor'
  | 'screening'
  | 'custom_roles'
  | 'whatsapp';

export type PlanEntitlements = {
  label: string;
  /** -1 = unlimited */
  seats: number;
  aiActions: number;
  docSets: number;
  features: Feature[];
  branding: boolean;
};

const CORE: Feature[] = ['core'];
const STARTER_FEATURES: Feature[] = [...CORE, 'doc_generator', 'rfq_broadcast'];
const BUSINESS_FEATURES: Feature[] = [
  ...STARTER_FEATURES, 'compliance_vault', 'lc_advisor', 'screening', 'custom_roles', 'whatsapp',
];

/** Single source of truth for plan limits & feature access. Changes ship as deploys. */
export const PLANS: Record<TenantPlan, PlanEntitlements> = {
  free: { label: 'Free', seats: 2, aiActions: 20, docSets: 0, features: CORE, branding: true },
  starter: { label: 'Starter', seats: 5, aiActions: 200, docSets: 10, features: STARTER_FEATURES, branding: true },
  growth: { label: 'Business', seats: -1, aiActions: 1000, docSets: 50, features: BUSINESS_FEATURES, branding: false },
  enterprise: { label: 'Enterprise', seats: -1, aiActions: 100000, docSets: 100000, features: BUSINESS_FEATURES, branding: false },
};

/**
 * Published monthly list price in INR (CFO_FINANCE_PRICING §2; MASTER_LAUNCH_PLAN pricing table).
 * -1 = "custom / talk to us". These are the launch price points pending founder confirmation before the
 * 2026 Q4 paid launch (a MASTER_LAUNCH_PLAN founder decision) — keep the pricing page reading from here so
 * a change is one edit.
 */
export const MONTHLY_INR: Record<TenantPlan, number> = {
  free: 0,
  starter: 1499,
  growth: 4999,
  enterprise: -1,
};

/** Metered overage rates (CFO_FINANCE_PRICING §2), shown on the pricing page against the ~₹4,000 CHA anchor. */
export const OVERAGE_INR = { aiActionsPer100: 199, docSet: 99 } as const;

export function planFeatures(plan: TenantPlan): Feature[] {
  return PLANS[plan].features;
}

export function planHasFeature(plan: TenantPlan, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

export function isUnlimited(n: number): boolean {
  return n < 0;
}
