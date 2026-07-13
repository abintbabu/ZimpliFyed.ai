'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { createInvoiceTemplate, deleteInvoiceTemplate } from '@/actions/invoices';
import { DEFAULT_EXPENSE_PCT, DEFAULT_MARGIN_PCT } from '@/lib/pricing-buildup';
import type { TemplateOption } from './new-invoice-form';

type Line = { description: string; quantity: string; cost: string; expensePct: string; marginPct: string; unitPrice: string };

const emptyLine = (): Line => ({
  description: '',
  quantity: '1',
  cost: '',
  expensePct: String(DEFAULT_EXPENSE_PCT),
  marginPct: String(DEFAULT_MARGIN_PCT),
  unitPrice: '',
});

export function InvoiceTemplates({ templates }: { templates: TemplateOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [dueDays, setDueDays] = useState('');
  const [isCreditOrDebitNote, setIsCreditOrDebitNote] = useState(false);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const reset = () => {
    setName('');
    setCurrency('USD');
    setDueDays('');
    setIsCreditOrDebitNote(false);
    setLines([emptyLine()]);
  };

  const save = () => {
    setError(null);
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    startTransition(async () => {
      try {
        await createInvoiceTemplate({
          name: name.trim(),
          currency: currency || 'USD',
          dueDays: dueDays ? parseInt(dueDays, 10) : undefined,
          isCreditOrDebitNote,
          lines: lines
            .filter((l) => l.description.trim())
            .map((l) => ({
              description: l.description.trim(),
              quantity: parseFloat(l.quantity) || 1,
              cost: parseFloat(l.cost) || 0,
              expensePct: l.expensePct ? parseFloat(l.expensePct) : undefined,
              marginPct: l.marginPct ? parseFloat(l.marginPct) : undefined,
              unitPrice: l.unitPrice ? parseFloat(l.unitPrice) : 0,
            })),
        });
        reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save template');
      }
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      try {
        await deleteInvoiceTemplate(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete template');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-line/40">
        Templates
      </button>
    );
  }

  return (
    <div className="w-full space-y-4 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Invoice templates</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Close
        </button>
      </div>

      {templates.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-ink">{t.name}</span>
                <span className="ml-2 text-xs text-muted">
                  {t.currency}
                  {t.dueDays != null ? ` · net ${t.dueDays}d` : ''} · {t.lines.length} line{t.lines.length === 1 ? '' : 's'}
                </span>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(t.id)}
                className="text-muted hover:text-red-600 disabled:opacity-50"
                aria-label={`Delete template ${t.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-line pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">New template</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:w-56"
          />
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder="Currency"
            maxLength={3}
            className="w-24 rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
          <input
            value={dueDays}
            onChange={(e) => setDueDays(e.target.value)}
            type="number"
            placeholder="Net days"
            className="w-28 rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
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
              <input
                value={l.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                type="number"
                step="0.01"
                placeholder="Unit price"
                className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="text-sm text-brand hover:underline">
          + Add line
        </button>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={isCreditOrDebitNote} onChange={(e) => setIsCreditOrDebitNote(e.target.checked)} />
          Credit/debit note template
        </label>

        <div className="flex items-center gap-3">
          <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? 'Saving…' : 'Save template'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
