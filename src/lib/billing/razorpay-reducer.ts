import 'server-only';
import { prisma } from '@/lib/prisma';
import { writeDomainEvent } from '@/lib/domain-events';
import { planForRazorpayPlanId } from './razorpay-adapter';

/**
 * Reducer for Razorpay subscription webhooks (DEV_PLAN_100 Sprint 1/3), mirroring stripe-reducer.ts:
 * maps provider state → Tenant.plan/status/currentPeriodEnd and logs a DomainEvent. Events for a tenant we
 * can't resolve are no-ops, so unrelated Razorpay account activity can't fail the webhook.
 *
 * We resolve the tenant from the subscription's `notes.tenantId` (set at creation) with a fallback to the
 * stored providerSubscriptionId.
 */

type RazorpaySubEntity = {
  id: string;
  status?: string;
  plan_id?: string;
  current_end?: number; // unix seconds
  notes?: Record<string, string>;
};

type RazorpayWebhook = {
  event: string;
  payload?: { subscription?: { entity?: RazorpaySubEntity } };
};

async function resolveTenantId(sub: RazorpaySubEntity): Promise<string | null> {
  if (sub.notes?.tenantId) return sub.notes.tenantId;
  const tenant = await prisma.tenant.findFirst({
    where: { billingProvider: 'razorpay', providerSubscriptionId: sub.id },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

function periodEnd(sub: RazorpaySubEntity): Date | undefined {
  return sub.current_end ? new Date(sub.current_end * 1000) : undefined;
}

export async function reduceRazorpayEvent(event: RazorpayWebhook): Promise<void> {
  const sub = event.payload?.subscription?.entity;
  if (!sub) return; // not a subscription event we handle
  const tenantId = await resolveTenantId(sub);
  if (!tenantId) return;

  const plan = sub.plan_id ? planForRazorpayPlanId(sub.plan_id) : null;
  const currentPeriodEnd = periodEnd(sub);

  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged': {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          billingProvider: 'razorpay',
          providerSubscriptionId: sub.id,
          status: 'active',
          pastDueSince: null,
          ...(plan ? { plan } : {}),
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      });
      await writeDomainEvent(prisma, {
        tenantId,
        type: event.event === 'subscription.charged' ? 'billing.payment_recovered' : 'billing.subscribed',
        refId: sub.id,
        payload: { plan },
      });
      return;
    }

    case 'subscription.pending':
    case 'subscription.halted': {
      // Payment failed / retries exhausted — enter the dunning path. The lifecycle sweep escalates from here.
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'past_due', pastDueSince: new Date() },
      });
      await writeDomainEvent(prisma, { tenantId, type: 'billing.payment_failed', refId: sub.id });
      return;
    }

    case 'subscription.cancelled':
    case 'subscription.completed': {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: 'free', status: 'active', providerSubscriptionId: null, currentPeriodEnd: null },
      });
      await writeDomainEvent(prisma, { tenantId, type: 'billing.cancelled', refId: sub.id });
      return;
    }

    default:
      return; // subscription.updated, .authenticated, etc. — no state change we track
  }
}
