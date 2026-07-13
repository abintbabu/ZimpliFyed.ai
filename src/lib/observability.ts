/**
 * Error/observability seam (DEV_PLAN_100 Sprint 1).
 *
 * A single `reportError` the whole app (server actions, route handlers, the job worker) can call. It is a
 * no-op unless SENTRY_DSN is configured, and it loads the Sentry SDK dynamically so the dependency is
 * optional — the app builds and runs without it. To turn it on: `npm i @sentry/node` (server) /
 * `@sentry/nextjs`, set SENTRY_DSN, and this lights up. No call sites change.
 */

type Sink = { captureException: (err: unknown, hint?: Record<string, unknown>) => void };

let sink: Sink | null = null;
let initialized = false;

async function getSink(): Promise<Sink | null> {
  if (initialized) return sink;
  initialized = true;
  if (!process.env.SENTRY_DSN) return null;
  try {
    // Optional dependency — resolved only when present. Building the specifier at runtime stops both
    // TypeScript and the bundler from statically resolving a package that may not be installed.
    const pkg = ['@sentry', 'node'].join('/');
    const mod = (await import(/* webpackIgnore: true */ pkg)) as unknown as {
      init: (opts: Record<string, unknown>) => void;
      captureException: (err: unknown, hint?: Record<string, unknown>) => void;
    };
    mod.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
    });
    sink = { captureException: (err, hint) => mod.captureException(err, hint) };
  } catch {
    // SDK not installed — stay a no-op, but don't crash the caller.
    sink = null;
  }
  return sink;
}

export async function reportError(err: unknown, context?: Record<string, unknown>): Promise<void> {
  // Always log locally so errors are never silently swallowed, DSN or not.
  console.error('[error]', err instanceof Error ? err.stack ?? err.message : err, context ?? '');
  const s = await getSink();
  s?.captureException(err, context ? { extra: context } : undefined);
}
