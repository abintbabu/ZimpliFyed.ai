import 'server-only';
import Stripe from 'stripe';

const globalForStripe = globalThis as unknown as { stripe?: Stripe };

/** Lazy singleton — constructing Stripe eagerly at module scope throws when STRIPE_SECRET_KEY is unset (e.g.
 * during `next build`, which evaluates every route module even ones that never run). Real key required at
 * call time only, when a checkout/portal/webhook route actually executes. */
function createClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set — billing checkout/portal/webhooks are unavailable until it is.');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion });
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = (globalForStripe.stripe ??= createClient());
    return Reflect.get(client, prop, receiver);
  },
});
