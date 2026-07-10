import 'server-only';
import { prisma } from '@/lib/prisma';
import { stripe } from './stripe-client';
import type { BillingProviderAdapter, OveragePack } from './provider';
import type { TenantPlan } from '@prisma/client';

/** Env-configured Stripe price IDs, one per paid plan + overage pack. Unset for a given plan/pack simply means
 * checkout for it isn't available yet — surfaced as a clear error rather than a broken Stripe call. */
const PLAN_PRICE_ENV: Record<Exclude<TenantPlan, 'free'>, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

const OVERAGE_PRICE_ENV: Record<OveragePack, string | undefined> = {
  ai_actions: process.env.STRIPE_PRICE_AI_ACTION_PACK,
  doc_sets: process.env.STRIPE_PRICE_DOC_SET_PACK,
};

/** Reverse lookup used by the webhook reducer to map a Stripe subscription's price back to our plan. */
export function planForStripePriceId(priceId: string): TenantPlan | null {
  for (const [plan, id] of Object.entries(PLAN_PRICE_ENV)) {
    if (id === priceId) return plan as TenantPlan;
  }
  return null;
}

async function getOrCreateCustomer(tenantId: string, customerEmail?: string): Promise<string> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (tenant.billingProvider === 'stripe' && tenant.providerCustomerId) return tenant.providerCustomerId;

  const customer = await stripe.customers.create({
    name: tenant.name,
    email: customerEmail,
    metadata: { tenantId },
  });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { billingProvider: 'stripe', providerCustomerId: customer.id },
  });
  return customer.id;
}

export const stripeAdapter: BillingProviderAdapter = {
  async createCheckout({ tenantId, plan, customerEmail, successUrl, cancelUrl }) {
    if (plan === 'free') throw new Error('Free plan does not require checkout');
    const priceId = PLAN_PRICE_ENV[plan];
    if (!priceId) throw new Error(`No Stripe price configured for the ${plan} plan yet — set STRIPE_PRICE_${plan.toUpperCase()}`);

    const customerId = await getOrCreateCustomer(tenantId, customerEmail);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tenantId, plan },
      subscription_data: { metadata: { tenantId, plan } },
      automatic_tax: { enabled: true },
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { url: session.url };
  },

  async createOverageCheckout({ tenantId, pack, successUrl, cancelUrl }) {
    const priceId = OVERAGE_PRICE_ENV[pack];
    if (!priceId) throw new Error(`No Stripe price configured for the ${pack} overage pack yet`);

    const customerId = await getOrCreateCustomer(tenantId);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tenantId, pack },
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { url: session.url };
  },

  async openPortal({ tenantId, returnUrl }) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.billingProvider !== 'stripe' || !tenant.providerCustomerId) {
      throw new Error('This tenant has no active Stripe billing account yet');
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.providerCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  },

  async cancelAt({ tenantId, when }) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.billingProvider !== 'stripe' || !tenant.providerSubscriptionId) {
      throw new Error('This tenant has no active Stripe subscription');
    }
    if (when === 'now') {
      await stripe.subscriptions.cancel(tenant.providerSubscriptionId);
    } else {
      await stripe.subscriptions.update(tenant.providerSubscriptionId, { cancel_at_period_end: true });
    }
  },
};

export function getBillingProvider(): BillingProviderAdapter {
  return stripeAdapter;
}
