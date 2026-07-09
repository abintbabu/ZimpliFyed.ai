'use client';

import { useState, useTransition } from 'react';
import { createBuyer } from '@/actions/buyers';

export function NewBuyerForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await createBuyer({
          name,
          country: String(formData.get('country') ?? ''),
          paymentTermsDefault: String(formData.get('paymentTermsDefault') ?? ''),
          currencyDefault: String(formData.get('currencyDefault') ?? 'USD'),
        });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create buyer');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        New buyer
      </button>
    );
  }

  return (
    <form action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2">
      <input name="name" required placeholder="Company name" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="country" placeholder="Country" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="paymentTermsDefault" placeholder="Payment terms (e.g. 30% adv / 70% BL)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="currencyDefault" placeholder="Currency (USD)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
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
