import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay REST client (DEV_PLAN_100 Sprint 1/3 — the INR billing rail; #1 revenue blocker).
 *
 * Deliberately fetch-based rather than pulling in the `razorpay` SDK: the Subscriptions surface we use is a
 * handful of endpoints, and a thin client keeps the dependency and bundle footprint down. Mirrors the
 * lazy-credential pattern of stripe-client.ts — keys are required at call time, not at module load, so
 * `next build` (which evaluates every route module) doesn't throw when they're unset.
 */

const BASE = 'https://api.razorpay.com/v1';

function auth(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) {
    throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set — INR billing is unavailable until they are.');
  }
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

async function call<T>(method: 'GET' | 'POST', pathname: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const desc = (json as { error?: { description?: string } })?.error?.description ?? res.statusText;
    throw new Error(`Razorpay ${method} ${pathname} failed (${res.status}): ${desc}`);
  }
  return json as T;
}

export type RazorpayCustomer = { id: string; email?: string; contact?: string };
export type RazorpaySubscription = { id: string; status: string; short_url?: string; current_end?: number; plan_id?: string };

export const razorpay = {
  createCustomer(input: { name: string; email?: string; notes?: Record<string, string> }) {
    // fail_existing=0 → return the existing customer instead of erroring on a duplicate email.
    return call<RazorpayCustomer>('POST', '/customers', {
      name: input.name,
      email: input.email,
      fail_existing: 0,
      notes: input.notes,
    });
  },

  createSubscription(input: {
    planId: string;
    customerId: string;
    totalCount: number;
    notes?: Record<string, string>;
  }) {
    return call<RazorpaySubscription>('POST', '/subscriptions', {
      plan_id: input.planId,
      customer_id: input.customerId,
      total_count: input.totalCount,
      customer_notify: 1,
      notes: input.notes,
    });
  },

  getSubscription(id: string) {
    return call<RazorpaySubscription>('GET', `/subscriptions/${id}`);
  },

  cancelSubscription(id: string, cancelAtCycleEnd: boolean) {
    return call<RazorpaySubscription>('POST', `/subscriptions/${id}/cancel`, {
      cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
    });
  },

  /** One-time payment link for overage packs (Razorpay Payment Links API). */
  createPaymentLink(input: { amountPaise: number; description: string; notes?: Record<string, string>; callbackUrl: string }) {
    return call<{ id: string; short_url: string }>('POST', '/payment_links', {
      amount: input.amountPaise,
      currency: 'INR',
      description: input.description,
      notes: input.notes,
      callback_url: input.callbackUrl,
      callback_method: 'get',
    });
  },
};

/** Verify a Razorpay webhook signature (HMAC-SHA256 of the raw body with the webhook secret). Constant-time. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
