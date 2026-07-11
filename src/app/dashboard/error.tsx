'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Dashboard-segment error boundary. Without this, an uncaught server error
 * (e.g. Prisma schema drift between a deployed build and the live database —
 * the July 2026 blank-dashboard incident) renders as a blank screen because
 * React unmounts the entire tree. Keeps the app shell visible and gives the
 * user a retry, plus the digest for correlating with Vercel runtime logs.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-ink">Something went wrong loading this page</h2>
        <p className="mt-1 text-sm text-muted">
          Our team has been notified. You can try again, or come back in a few minutes.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-muted">Error reference: {error.digest}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
