import 'server-only';
import { prisma } from '@/lib/prisma';
import { razorpay } from './razorpay-client';
import type { BillingProviderAdapter, OveragePack } from './provider';
import type { TenantPlan } from '@prisma/client';

/**
 * Razorpay billing adapter for India-billed tenants (DEV_PLAN_100 Sprint 1/3).
 *
 * Razorpay's model differs from Stripe's: there is no hosted "checkout session" for subscriptions — you
 * create a Subscription server-side and redirect the customer to its `short_url`. Plan IDs are pre-created
 * in the Razorpay dashboard (like Stripe price IDs) and supplied via env. Overage packs are one-time
 * Payment Links. GSTIN is captured on the tenant and passed as a subscription note so Razorpay can raise a
 * GST-compliant invoice (BILLING_SPEC §2 step 3).
 */

const PLAN_ID_ENV: Record<Exclude<TenantPlan, 'free'>, string | undefined> = {
  starter: process.env.RAZORPAY_PLAN_STARTER,
  growth: process.env.RAZORPAY_PLAN_GROWTH,
  enterprise: process.env.RAZORPAY_PLAN_ENTERPRISE,
};

// Overage pack prices in paise (₹199 / 100 AI actions; ₹99 / doc-set), per CFO_FINANCE_PRICING §2.
const OVERAGE_PAISE: Record<OveragePack, number> = {
  ai_actions: 199_00,
  doc_sets: 99_00,
};

const OVERAGE_LABEL: Record<OveragePack, string> = {
  ai_actions: '100 AI actions',
  doc_sets: '1 document set',
};

// Subscriptions renew monthly; Razorpay requires a finite total_count. 120 = 10 years, effectively "until cancelled".
const TOTAL_COUNT = 120;

/** Map a Razorpay plan_id back to our TenantPlan — used by the webhook reducer. */
export function planForRazorpayPlanId(planId: string): TenantPlan | null {
  for (const [plan, id] of Object.entries(PLAN_ID_ENV)) {
    if (id === planId) return plan as TenantPlan;
  }
  return null;
}

async function getOrCreateCustomer(tenantId: string, customerEmail?: string): Promise<string> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (tenant.billingProvider === 'razorpay' && tenant.providerCustomerId) return tenant.providerCustomerId;

  const customer = await razorpay.createCustomer({
    name: tenant.name,
    email: customerEmail,
    notes: { tenantId, ...(tenant.gstin ? { gstin: tenant.gstin } : {}) },
  });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { billingProvider: 'razorpay', providerCustomerId: customer.id },
  });
  return customer.id;
}

export const razorpayAdapter: BillingProviderAdapter = {
  async createCheckout({ tenantId, plan, customerEmail }) {
    if (plan === 'free') throw new Error('Free plan does not require checkout');
    const planId = PLAN_ID_ENV[plan];
    if (!planId) throw new Error(`No Razorpay plan configured for the ${plan} plan yet — set RAZORPAY_PLAN_${plan.toUpperCase()}`);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const customerId = await getOrCreateCustomer(tenantId, customerEmail);
    const sub = await razorpay.createSubscription({
      planId,
      customerId,
      totalCount: TOTAL_COUNT,
      notes: { tenantId, plan, ...(tenant.gstin ? { gstin: tenant.gstin } : {}) },
    });
    if (!sub.short_url) throw new Error('Razorpay did not return a subscription checkout URL');
    // Record the subscription id now; the webhook confirms activation and flips status to active.
    await prisma.tenant.update({ where: { id: tenantId }, data: { providerSubscriptionId: sub.id } });
    return { url: sub.short_url };
  },

  async createOverageCheckout({ tenantId, pack, successUrl }) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const link = await razorpay.createPaymentLink({
      amountPaise: OVERAGE_PAISE[pack],
      description: `Zimplifyed overage — ${OVERAGE_LABEL[pack]}`,
      notes: { tenantId, pack, ...(tenant.gstin ? { gstin: tenant.gstin } : {}) },
      callbackUrl: successUrl,
    });
    return { url: link.short_url };
  },

  async openPortal({ tenantId }) {
    // Razorpay has no hosted customer portal. Subscription management (pause/cancel/update) is handled
    // in-app against our own UI, which calls cancelAt() etc. Surfaced as a clear message rather than a
    // broken redirect.
    void tenantId;
    throw new Error('Manage your India-billed subscription from Settings → Billing; Razorpay has no external portal.');
  },

  async cancelAt({ tenantId, when }) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.billingProvider !== 'razorpay' || !tenant.providerSubscriptionId) {
      throw new Error('This tenant has no active Razorpay subscription');
    }
    await razorpay.cancelSubscription(tenant.providerSubscriptionId, when === 'period_end');
  },
};
