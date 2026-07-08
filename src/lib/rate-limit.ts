type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * In-memory fixed-window rate limiter. Single-process only — fine for the
 * `next start` deployment this app runs on, not for multi-instance/serverless.
 * Revisit with a shared store (Redis/DB) if that changes.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}
