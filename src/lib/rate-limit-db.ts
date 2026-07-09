import 'server-only';
import { prisma } from './prisma';

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

/**
 * Persistent sliding-ish (fixed-window) rate limiter backed by the RateLimit
 * table, so limits hold across serverless instances — unlike the in-memory
 * limiter in `rate-limit.ts`. Use for auth-critical keys (signin, invite,
 * orgcreate, slugcheck).
 */
export async function checkRateLimitDb(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  // Fetch-or-create the window row.
  const existing = await prisma.rateLimit.findUnique({ where: { key } });

  if (!existing || existing.resetAt <= now) {
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: 1, resetAt },
    });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000)),
    };
  }

  await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return { allowed: true, retryAfterSec: 0 };
}
