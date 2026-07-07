'use client';

import { useState, useTransition } from 'react';
import { createIncentiveClaim } from '@/actions/incentive-claims';
import type { IncentiveType } from '@prisma/client';

const TYPE_LABELS: Record<IncentiveType, string> = {
  rodtep: 'RoDTEP',
  drawback: 'Duty drawback',
  epcg_obligation: 'EPCG obligation',
};

export function NewIncentiveClaimForm({ orders }: { orders: { id: string; orderNumber: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    const orderId = String(formData.get('orderId') ?? '');
    const amount = Number(formData.get('amount') ?? 0);
    if (!orderId || !amount) {
      setError('Order and amount are required');
      return;
    }
    startTransition(async () => {
      try {
        await createIncentiveClaim({
          orderId,
          type: String(formData.get('type') ?? 'rodtep') as IncentiveType,
          amount,
          currency: String(formData.get('currency') ?? 'INR'),
          notes: String(formData.get('notes') ?? ''),
        });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add claim');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        Track claim
      </button>
    );
  }

  return (
    <form action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2">
      <select name="orderId" required className="rounded-lg border border-line px-3 py-2 text-sm text-ink">
        <option value="">Select order…</option>
        {orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}
      </select>
      <select name="type" className="rounded-lg border border-line px-3 py-2 text-sm text-ink">
        {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input name="amount" type="number" step="0.01" required placeholder="Amount" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="currency" defaultValue="INR" placeholder="Currency" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <textarea name="notes" placeholder="Notes" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" rows={2} />

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
