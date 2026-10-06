'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPurchaseOrderFromRfq } from '@/actions/purchase-orders';

export function CreatePoButton({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try { const po = await createPurchaseOrderFromRfq(rfqId); router.push(`/dashboard/purchase-orders/${po.id}`); }
            catch (e) { setError(e instanceof Error ? e.message : 'Could not create the purchase order'); }
          });
        }}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create purchase order'}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
