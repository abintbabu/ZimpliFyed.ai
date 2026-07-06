'use client';

import { useTransition } from 'react';
import { createBuyerTrackLink, refreshBuyerTrackLink, revokeBuyerTrackLink } from '@/actions/order-track';
import type { OrderBuyerTrack } from '@prisma/client';

export function OrderBuyerTrackPanel({ orderId, tracks }: { orderId: string; tracks: OrderBuyerTrack[] }) {
  const [pending, startTransition] = useTransition();

  const active = tracks.filter((t) => t.active);

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Buyer tracking link</h3>
        <button
          disabled={pending}
          onClick={() => startTransition(async () => { await createBuyerTrackLink(orderId); })}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink disabled:opacity-50"
        >
          {active.length ? 'Create another link' : 'Create link'}
        </button>
      </div>
      {active.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.02] px-3 py-2 text-xs">
          <code className="truncate text-ink">/track/{t.token}</code>
          <div className="flex shrink-0 gap-2">
            <button disabled={pending} onClick={() => startTransition(async () => { await refreshBuyerTrackLink(t.id); })} className="text-brand hover:underline">
              Refresh
            </button>
            <button disabled={pending} onClick={() => startTransition(() => revokeBuyerTrackLink(t.id))} className="text-red-600 hover:underline">
              Revoke
            </button>
          </div>
        </div>
      ))}
      {active.length === 0 && <p className="text-xs text-muted">No active buyer link yet.</p>}
    </div>
  );
}
