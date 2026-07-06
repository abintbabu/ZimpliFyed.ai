'use client';

import { useState, useTransition } from 'react';
import { createQuote } from '@/actions/quotes';
import { DEFAULT_EXPENSE_PCT, DEFAULT_MARGIN_PCT } from '@/lib/pricing-buildup';

type Line = { description: string; quantity: string; cost: string; expensePct: string; marginPct: string; unitPrice: string };

const emptyLine = (): Line => ({
  description: '',
  quantity: '1',
  cost: '',
  expensePct: String(DEFAULT_EXPENSE_PCT),
  marginPct: String(DEFAULT_MARGIN_PCT),
  unitPrice: '',
});

export function NewQuoteForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = () => {
    setError(null);
    if (!quoteNumber.trim()) return;
    startTransition(async () => {
      try {
        await createQuote({
          quoteNumber: quoteNumber.trim(),
          lines: lines
            .filter((l) => l.description.trim() && l.cost)
            .map((l) => ({
              description: l.description.trim(),
              quantity: parseFloat(l.quantity) || 1,
              cost: parseFloat(l.cost),
              expensePct: l.expensePct ? parseFloat(l.expensePct) : undefined,
              marginPct: l.marginPct ? parseFloat(l.marginPct) : undefined,
              unitPrice: l.unitPrice ? parseFloat(l.unitPrice) : 0,
            })),
        });
        setOpen(false);
        setQuoteNumber('');
        setLines([emptyLine()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create quote');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        New quote
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <input
        value={quoteNumber}
        onChange={(e) => setQuoteNumber(e.target.value)}
        required
        placeholder="Quote number"
        className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink sm:w-64"
      />

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input
              value={l.description}
              onChange={(e) => updateLine(i, { description: e.target.value })}
              placeholder="Description"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2"
            />
            <input
              value={l.quantity}
              onChange={(e) => updateLine(i, { quantity: e.target.value })}
              type="number"
              placeholder="Qty"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
            <input
              value={l.cost}
              onChange={(e) => updateLine(i, { cost: e.target.value })}
              type="number"
              step="0.01"
              placeholder="Cost"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
            <div className="flex gap-1">
              <input
                value={l.expensePct}
                onChange={(e) => updateLine(i, { expensePct: e.target.value })}
                type="number"
                placeholder="Exp %"
                className="w-1/2 rounded-lg border border-line px-2 py-2 text-sm text-ink"
              />
              <input
                value={l.marginPct}
                onChange={(e) => updateLine(i, { marginPct: e.target.value })}
                type="number"
                placeholder="Margin %"
                className="w-1/2 rounded-lg border border-line px-2 py-2 text-sm text-ink"
              />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="text-sm text-brand hover:underline">
        + Add line
      </button>

      <div className="flex items-center gap-3">
        <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
