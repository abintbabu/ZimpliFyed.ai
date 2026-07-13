import { reportError } from '@/lib/observability';

/**
 * Next.js instrumentation hook (DEV_PLAN_100 Sprint 1). `onRequestError` fires for uncaught errors in
 * server components, route handlers and server actions — the single funnel into our observability seam.
 * `register` runs once at server startup (a place to init tracing later). Both are no-ops until SENTRY_DSN
 * is set (see observability.ts).
 */

export async function register() {
  // Reserved for one-time startup initialization (tracing, metrics). Intentionally empty for now.
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
