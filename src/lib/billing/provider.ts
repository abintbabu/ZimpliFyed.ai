import 'server-only';
import type { TenantPlan } from '@prisma/client';

/** Provider-neutral billing abstraction (BILLING_SPEC §2). Razorpay is the intended second adapter for
 * India-billed tenants — not implemented yet, so `getBillingProvider` always returns the Stripe adapter today. */
export type OveragePack = 'ai_actions' | 'doc_sets';

export interface BillingProviderAdapter {
  createCheckout(input: {
    tenantId: string;
    plan: TenantPlan;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;

  createOverageCheckout(input: {
    tenantId: string;
    pack: OveragePack;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;

  openPortal(input: { tenantId: string; returnUrl: string }): Promise<{ url: string }>;

  /** Cancels the tenant's subscription — at the current period end (default) or immediately. */
  cancelAt(input: { tenantId: string; when: 'period_end' | 'now' }): Promise<void>;
}
