'use client';

import { useState, useTransition } from 'react';
import { recordBankRealization, deleteBankRealization } from '@/actions/bank-realizations';

type Realization = {
  id: string;
  fircNumber: string | null;
  ebrcNumber: string | null;
  bankName: string | null;
  realizedAmount: number;
  realizedCurrency: string;
  realizedAt: Date;
};

function emptyForm() {
  return { fircNumber: '', ebrcNumber: '', bankName: '', realizedAmount: '', realizedAt: '' };
}

export function BankRealizationPanel({
  invoiceId,
  currency,
  invoiceTotal,
  canWrite,
  initial,
}: {
  invoiceId: string;
  currency: string;
  invoiceTotal: number;
  canWrite: boolean;
  initial: Realization[];
}) {
  const [realizations, setRealizations] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const realized = realizations.reduce((sum, r) => sum + r.realizedAmount, 0);
  const outstanding = parseFloat((invoiceTotal - realized).toFixed(2));

  function submit() {
    setError(null);
    const amount = Number(form.realizedAmount);
    if (!amount || amount <= 0) {
      setError('Enter a realized amount.');
      return;
    }
    if (!form.realizedAt) {
      setError('Enter the realization date.');
      return;
    }
    startTransition(async () => {
      try {
        const created = await recordBankRealization({
          invoiceId,
          fircNumber: form.fircNumber || undefined,
          ebrcNumber: form.ebrcNumber || undefined,
          bankName: form.bankName || undefined,
          realizedAmount: amount,
          realizedCurrency: currency,
          realizedAt: new Date(form.realizedAt),
        });
        setRealizations((prev) => [created, ...prev]);
        setForm(emptyForm());
        setAdding(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record realization');
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await deleteBankRealization(id);
        setRealizations((prev) => prev.filter((r) => r.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove realization');
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Bank realization (e-BRC / FIRC)</h2>
          <p className="mt-0.5 text-xs text-muted">
            {realized > 0
              ? `${currency} ${realized.toFixed(2)} realized · ${currency} ${outstanding.toFixed(2)} outstanding`
              : `${currency} ${outstanding.toFixed(2)} not yet realized`}
          </p>
        </div>
        {canWrite && !adding && (
          <button onClick={() => setAdding(true)} className="text-sm font-medium text-brand hover:underline">
            Add realization
          </button>
        )}
      </div>

      {realizations.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">FIRC #</th>
              <th className="px-4 py-3">e-BRC #</th>
              <th className="px-4 py-3">Bank</th>
              <th className="px-4 py-3">Amount</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {realizations.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 text-muted">{new Date(r.realizedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-ink">{r.fircNumber || '—'}</td>
                <td className="px-4 py-3 text-ink">{r.ebrcNumber || '—'}</td>
                <td className="px-4 py-3 text-muted">{r.bankName || '—'}</td>
                <td className="px-4 py-3 text-muted">{r.realizedCurrency} {r.realizedAmount.toFixed(2)}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button disabled={pending} onClick={() => remove(r.id)} className="text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <div className="space-y-2 border-t border-line p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              value={form.realizedAt}
              onChange={(e) => setForm((f) => ({ ...f, realizedAt: e.target.value }))}
              type="date"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
            <input
              value={form.realizedAmount}
              onChange={(e) => setForm((f) => ({ ...f, realizedAmount: e.target.value }))}
              type="number"
              step="0.01"
              placeholder={`Amount (${currency})`}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
            <input
              value={form.fircNumber}
              onChange={(e) => setForm((f) => ({ ...f, fircNumber: e.target.value }))}
              placeholder="FIRC number"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
            <input
              value={form.ebrcNumber}
              onChange={(e) => setForm((f) => ({ ...f, ebrcNumber: e.target.value }))}
              placeholder="e-BRC number"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
          </div>
          <input
            value={form.bankName}
            onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
            placeholder="Bank name"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink sm:w-1/2"
          />
          <div className="flex items-center gap-3 pt-1">
            <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setForm(emptyForm()); setError(null); }} className="text-sm text-muted hover:text-ink">
              Cancel
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
