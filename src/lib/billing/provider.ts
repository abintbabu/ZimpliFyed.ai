import 'server-only';
import { prisma } from '@/lib/prisma';
import type { TenantPlan } from '@prisma/client';

/** Provider-neutral billing abstraction (BILLING_SPEC §2). Two adapters exist: Stripe (international) and
 * Razorpay (India-billed, INR/UPI + GST invoices). `getBillingProviderForTenant` picks the right one. */
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

/**
 * Route a tenant to its billing rail (DEV_PLAN_100 Sprint 1):
 *   1. If the tenant already has a linked provider, keep using it (never strand an active subscription).
 *   2. Otherwise pick by country pack — India-pack tenants bill in INR via Razorpay; everyone else Stripe.
 * Dynamic imports avoid a circular module load (each adapter imports prisma, which imports this indirectly).
 */
export async function getBillingProviderForTenant(tenantId: string): Promise<BillingProviderAdapter> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { billingProvider: true, packId: true },
  });

  const rail =
    tenant.billingProvider ?? (tenant.packId === 'in' ? 'razorpay' : 'stripe');

  if (rail === 'razorpay') {
    const { razorpayAdapter } = await import('./razorpay-adapter');
    return razorpayAdapter;
  }
  const { stripeAdapter } = await import('./stripe-adapter');
  return stripeAdapter;
}
