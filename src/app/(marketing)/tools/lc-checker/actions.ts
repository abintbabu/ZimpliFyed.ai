'use server';

import { headers } from 'next/headers';
import { reviewLcTerms, type LcReview } from '@/lib/ai/lc-advisor';
import { getSystemTenantId } from '@/lib/ai/system-tenant';
import { checkRateLimitDb } from '@/lib/rate-limit-db';

export type LcCheckerResult =
  | { ok: true; result: LcReview }
  | { ok: false; error: string };

/**
 * Public, unauthenticated LC discrepancy checker for the marketing tool (DEV_PLAN_100 Sprint 6 — the PQL
 * magnet). Pastes an LC (or its key clauses) plus an optional order brief; returns workability + flagged
 * clauses. IP-rate-limited, runs on the system tenant, nothing persisted. Decision support, not legal/CHA
 * advice — the UI says so.
 */
export async function checkLcTerms(lcText: string, orderBrief: string): Promise<LcCheckerResult> {
  const lc = lcText.trim();
  if (lc.length < 40) return { ok: false, error: 'Paste the LC text (or at least its key clauses) — a few lines minimum.' };
  if (lc.length > 12_000) return { ok: false, error: 'That is very long — paste just the terms/clauses, under ~12,000 characters.' };

  const h = await headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim();
  const rl = await checkRateLimitDb(`lcchecker:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return { ok: false, error: `Free checks used up. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min or sign up.` };

  try {
    const tenantId = await getSystemTenantId();
    const context = orderBrief.trim() ? orderBrief.trim().slice(0, 1000) : 'No order details provided — assess the LC terms on their own.';
    const { review } = await reviewLcTerms(lc, context, tenantId, 'public-tool');
    return { ok: true, result: review };
  } catch {
    return { ok: false, error: 'Could not review that — try pasting the clauses again.' };
  }
}
