'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFxRate } from '@/actions/fx';

export function FxForm({ baseCurrency }: { baseCurrency: string }) {
  const router = useRouter();
  const [currency, setCurrency] = useState('USD');
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await setFxRate({ currency, rateToBase: Number(rate), asOf: asOf || undefined });
        setRate('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the rate');
      }
    });
  }

  const input = 'rounded-lg border border-line px-3 py-2 text-sm text-ink';
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-muted">Currency
        <input aria-label="Currency" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={`${input} block w-24`} />
      </label>
      <label className="text-xs text-muted">1 unit = ? {baseCurrency}
        <input aria-label="Rate" type="number" step="any" min={0} required value={rate} onChange={(e) => setRate(e.target.value)} className={`${input} block w-36`} />
      </label>
      <label className="text-xs text-muted">As of (optional)
        <input aria-label="As of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={`${input} block`} />
      </label>
      <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save rate'}</button>
      {error && <p role="alert" className="basis-full text-sm text-red-700">{error}</p>}
    </form>
  );
}
