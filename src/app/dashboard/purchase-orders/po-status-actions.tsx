'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPurchaseOrderStatus } from '@/actions/purchase-orders';
import { nextPoStatuses, type PoStatus } from '@/lib/purchase-order';

const LABEL: Record<PoStatus, string> = { draft: 'Draft', issued: 'Issue to vendor', acknowledged: 'Mark acknowledged', received: 'Mark received', cancelled: 'Cancel PO' };

export function PoStatusActions({ poId, status }: { poId: string; status: PoStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = nextPoStatuses(status);
  if (next.length === 0) return null;

  function go(to: PoStatus) {
    if (to === 'cancelled' && !window.confirm('Cancel this purchase order? This cannot be undone.')) return;
    setError(null);
    startTransition(async () => {
      try { await setPurchaseOrderStatus(poId, to); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not update the purchase order'); }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {next.map((to) => (
        <button key={to} disabled={pending} onClick={() => go(to)} className={`rounded-lg px-3 py-1.5 text-sm disabled:opacity-50 ${to === 'cancelled' ? 'border border-line text-ink' : 'bg-brand font-medium text-white'}`}>{LABEL[to]}</button>
      ))}
      {error && <p role="alert" className="basis-full text-sm text-red-700">{error}</p>}
    </div>
  );
}
