import { reportError } from '@/lib/observability';

/**
 * Next.js instrumentation hook (DEV_PLAN_100 Sprint 1). `onRequestError` fires for uncaught errors in
 * server components, route handlers and server actions — the single funnel into our observability seam.
 * `register` runs once at server startup (a place to init tracing later). Both are no-ops until SENTRY_DSN
 * is set (see observability.ts).
 */

export async function register() {
  // EXPORT_OS_MASTER_PLAN §4.2 — ALLOW_DEV_TENANT_FALLBACK gates classifyHost's `dev` resolution
  // (src/lib/tenant-resolver.ts), which lets an unmatched Host header resolve to a real tenant. That
  // is a deliberate local-dev convenience and must never reach production; refuse to boot rather than
  // silently allow it.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_TENANT_FALLBACK === '1') {
    throw new Error('ALLOW_DEV_TENANT_FALLBACK=1 must not be set in production — it disables tenant-host isolation.');
  }
}

export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string },
) {
  await reportError(err, {
    path: request?.path,
    method: request?.method,
    routerKind: context?.routerKind,
    routePath: context?.routePath,
  });
}
