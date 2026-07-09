'use server';

import { headers } from 'next/headers';
import { classifyHsCode, type HsClassification } from '@/lib/ai/hs-classification';
import { checkRateLimitDb } from '@/lib/rate-limit-db';

export type HsFinderResult =
  | { ok: true; result: HsClassification }
  | { ok: false; error: string };

/** Public, unauthenticated HS lookup for the marketing tool. IP-rate-limited; nothing persisted. */
export async function findHsCode(description: string): Promise<HsFinderResult> {
  const clean = description.trim();
  if (clean.length < 3) return { ok: false, error: 'Describe your product in a few words' };
  if (clean.length > 300) return { ok: false, error: 'Keep it under 300 characters' };

  const h = await headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim();
  const rl = await checkRateLimitDb(`hsfinder:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return { ok: false, error: `Free lookups used up. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min or sign up.` };

  try {
    const result = await classifyHsCode(clean);
    return { ok: true, result };
  } catch {
    return { ok: false, error: 'Could not classify that — try rephrasing.' };
  }
}
