'use client';

import { useState, useTransition } from 'react';
import { respondToSharedQuote } from '@/actions/quotes';

export function RespondForm({ token, status }: { token: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [done, setDone] = useState<'accept' | 'request_changes' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === 'accepted' || done === 'accept') {
    return <p className="rounded-xl bg-green-50 p-4 text-sm text-green-700">You accepted this quote. The seller will follow up shortly.</p>;
  }
  if (done === 'request_changes') {
    return <p className="rounded-xl bg-black/[0.03] p-4 text-sm text-ink">Thanks — we've let the seller know you'd like changes.</p>;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (e.g. what you'd like changed)"
        className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
      />
      <div className="flex gap-3">
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await respondToSharedQuote(token, 'accept', note);
                setDone('accept');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to submit');
              }
            })
          }
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Accept quote
        </button>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await respondToSharedQuote(token, 'request_changes', note);
                setDone('request_changes');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to submit');
              }
            })
          }
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
        >
          Request changes
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
