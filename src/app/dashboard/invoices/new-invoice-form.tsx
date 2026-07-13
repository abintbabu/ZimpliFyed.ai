'use client';

import { useState, useTransition } from 'react';
import { createInvoice } from '@/actions/invoices';
import { DEFAULT_EXPENSE_PCT, DEFAULT_MARGIN_PCT } from '@/lib/pricing-buildup';

type Line = { description: string; quantity: string; cost: string; expensePct: string; marginPct: string; unitPrice: string };

export type TemplateOption = {
  id: string;
  name: string;
  currency: string;
  dueDays: number | null;
  isCreditOrDebitNote: boolean;
  lines: { description: string; quantity: number; cost: number; expensePct: number; marginPct: number; unitPrice: number }[];
};

const emptyLine = (): Line => ({
  description: '',
  quantity: '1',
  cost: '',
  expensePct: String(DEFAULT_EXPENSE_PCT),
  marginPct: String(DEFAULT_MARGIN_PCT),
  unitPrice: '',
});

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function NewInvoiceForm({
  templates,
  orders,
}: {
  templates: TemplateOption[];
  orders: { id: string; orderNumber: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [dueDate, setDueDate] = useState('');
  const [isCreditOrDebitNote, setIsCreditOrDebitNote] = useState(false);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((tpl) => tpl.id === id);
    if (!t) return;
    setCurrency(t.currency);
    setIsCreditOrDebitNote(t.isCreditOrDebitNote);
    setDueDate(t.dueDays != null ? addDays(t.dueDays) : '');
    setLines(
      t.lines.length
        ? t.lines.map((l) => ({
            description: l.description,
            quantity: String(l.quantity),
            cost: String(l.cost),
            expensePct: String(l.expensePct),
            marginPct: String(l.marginPct),
            unitPrice: String(l.unitPrice),
          }))
        : [emptyLine()],
    );
  };

  const reset = () => {
    setInvoiceNumber('');
    setTemplateId('');
    setOrderId('');
    setCurrency('USD');
    setDueDate('');
    setIsCreditOrDebitNote(false);
    setLines([emptyLine()]);
  };

  const submit = () => {
    setError(null);
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required');
      return;
    }
    startTransition(async () => {
      try {
        await createInvoice({
          invoiceNumber: invoiceNumber.trim(),
          templateId: templateId || undefined,
          orderId: orderId || undefined,
          currency: currency || 'USD',
          dueDate: dueDate ? new Date(dueDate) : undefined,
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
        setOpen(false);
        reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create invoice');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        New invoice
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          required
          placeholder="Invoice number"
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:w-56"
        />
        {templates.length > 0 && (
          <select
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
          >
            <option value="">No template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <select
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
        >
          <option value="">No order</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>{o.orderNumber}</option>
          ))}
        </select>
        <input
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="Currency"
          maxLength={3}
          className="w-24 rounded-lg border border-line px-3 py-2 text-sm text-ink"
        />
        <input
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          type="date"
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
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
        This is a credit/debit note
      </label>

      <div className="flex items-center gap-3">
        <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
