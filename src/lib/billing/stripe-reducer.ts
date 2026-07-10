import 'server-only';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { writeDomainEvent } from '@/lib/domain-events';
import { planForStripePriceId } from './stripe-adapter';
import type { TenantPlan } from '@prisma/client';

/** Single reducer for every Stripe webhook event we care about (BILLING_SPEC §2) — maps provider state to
 * `Tenant.plan/status/currentPeriodEnd` and logs a DomainEvent. Events for a tenant we can't resolve are no-ops
 * (e.g. a stray customer.* event for a customer we never linked) rather than errors, so unrelated Stripe
 * account activity can't fail the webhook. */
export async function reduceStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      if (!tenantId || session.mode !== 'subscription' || !session.subscription) return;

      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const plan = session.metadata?.plan as TenantPlan | undefined;

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          billingProvider: 'stripe',
          providerSubscriptionId: subscriptionId,
          status: 'active',
          ...(plan ? { plan } : {}),
        },
      });
      await writeDomainEvent(prisma, { tenantId, type: 'billing.subscribed', refId: subscriptionId, payload: { plan } });
      return;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) return;

      const priceId = sub.items.data[0]?.price.id;
      const plan = priceId ? planForStripePriceId(priceId) : null;
      const currentPeriodEnd = sub.items.data[0]?.current_period_end
        ? new Date(sub.items.data[0].current_period_end * 1000)
        : null;

      const statusUpdate =
        sub.status === 'active' || sub.status === 'trialing'
          ? { status: 'active' as const, pastDueSince: null }
          : sub.status === 'past_due' || sub.status === 'unpaid'
            ? { status: 'past_due' as const }
            : {};

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          providerSubscriptionId: sub.id,
          currentPeriodEnd,
          ...(plan ? { plan } : {}),
          ...statusUpdate,
        },
      });
      return;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) return;

      // Cancellation downgrades to free and keeps the tenant active — never a punitive suspend for a
      // deliberate cancel (that's reserved for payment failure, per the lifecycle machine).
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: 'free', status: 'active', providerSubscriptionId: null, currentPeriodEnd: null },
      });
      await writeDomainEvent(prisma, { tenantId, type: 'billing.cancelled', refId: sub.id });
      return;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) return;
      const tenant = await prisma.tenant.findFirst({ where: { providerCustomerId: customerId } });
      if (!tenant) return;

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'past_due', pastDueSince: tenant.pastDueSince ?? new Date() },
      });
      await writeDomainEvent(prisma, { tenantId: tenant.id, type: 'billing.payment_failed', refId: invoice.id });
      return;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) return;
      const tenant = await prisma.tenant.findFirst({ where: { providerCustomerId: customerId } });
      if (!tenant || tenant.status !== 'past_due') return;

      await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'active', pastDueSince: null } });
      await writeDomainEvent(prisma, { tenantId: tenant.id, type: 'billing.payment_recovered', refId: invoice.id });
      return;
    }

    default:
      return;
  }
}
