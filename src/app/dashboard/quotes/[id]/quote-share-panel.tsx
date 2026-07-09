'use client';

import { useTransition } from 'react';
import { createQuoteShareLink, revokeQuoteShareLink } from '@/actions/quotes';

export function QuoteSharePanel({ quoteId, shareToken, expiresAt }: { quoteId: string; shareToken: string | null; expiresAt: Date | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Buyer share link</h3>
        <button
          disabled={pending}
          onClick={() => startTransition(async () => { await createQuoteShareLink(quoteId); })}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink disabled:opacity-50"
        >
          {shareToken ? 'Rotate link' : 'Create link'}
        </button>
      </div>
      {shareToken ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.02] px-3 py-2 text-xs">
          <code className="truncate text-ink">/quote/{shareToken}</code>
          <div className="flex shrink-0 items-center gap-2">
            {expiresAt && <span className="text-muted">expires {new Date(expiresAt).toLocaleDateString()}</span>}
            <button disabled={pending} onClick={() => startTransition(() => revokeQuoteShareLink(quoteId))} className="text-red-600 hover:underline">
              Revoke
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">No active buyer link yet.</p>
      )}
    </div>
  );
}
