'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import Link from 'next/link';

/** Root error boundary — catch-all so no route ever renders a blank screen. */
export default function RootError({
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-5 text-center">
      <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        An unexpected error occurred. Try again, or head back to the homepage.
        {error.digest ? ` (ref: ${error.digest})` : ''}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link href="/" className="text-sm font-medium text-muted underline underline-offset-2 hover:text-ink">
          Go home
        </Link>
      </div>
    </main>
  );
}
