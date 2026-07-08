'use client';

import { useState, useTransition } from 'react';
import { updateInvoiceLines } from '@/actions/invoices';

type Line = { id: string; description: string; quantity: number; cost: number; expensePct: number; marginPct: number; unitPrice: number };

let nextId = 0;
function newLine(): Line {
  nextId += 1;
  return { id: `new-${nextId}`, description: '', quantity: 1, cost: 0, expensePct: 0, marginPct: 0, unitPrice: 0 };
}

export function InvoiceLineItemsPanel({
  invoiceId,
  currency,
  canWrite,
  initial,
}: {
  invoiceId: string;
  currency: string;
  canWrite: boolean;
  initial: { id: string; description: string; quantity: number; cost: number; expensePct: number; marginPct: number; unitPrice: number; lineTotal: number }[];
}) {
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<Line[]>(initial.length ? initial.map((l) => ({ ...l })) : [newLine()]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lineTotal = (l: Line) => l.quantity * l.unitPrice;
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function cancel() {
    setLines(initial.length ? initial.map((l) => ({ ...l })) : [newLine()]);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateInvoiceLines(
          invoiceId,
          lines
            .filter((l) => l.description.trim())
            .map((l) => ({
              description: l.description.trim(),
              quantity: l.quantity,
              cost: l.cost,
              expensePct: l.expensePct,
              marginPct: l.marginPct,
              unitPrice: l.unitPrice,
            })),
        );
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save line items');
      }
    });
  }

  if (!editing) {
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Line items</h2>
          {canWrite && (
            <button onClick={() => setEditing(true)} className="text-sm font-medium text-brand hover:underline">
              Edit
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Line total</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-4 py-3 text-ink">{l.description}</td>
                <td className="px-4 py-3 text-muted">{l.quantity}</td>
                <td className="px-4 py-3 text-muted">{l.unitPrice.toFixed(2)}</td>
                <td className="px-4 py-3 text-muted">{l.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Edit line items</h2>

      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              value={l.description}
              onChange={(e) => updateLine(l.id, { description: e.target.value })}
              placeholder="Description"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2"
            />
            <input
              value={l.quantity}
              onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })}
              type="number"
              placeholder="Qty"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
            <div className="flex items-center gap-2">
              <input
                value={l.unitPrice}
                onChange={(e) => updateLine(l.id, { unitPrice: Number(e.target.value) })}
                type="number"
                step="0.01"
                placeholder="Unit price"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
              />
              <button type="button" onClick={() => removeLine(l.id)} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => setLines((prev) => [...prev, newLine()])} className="mt-2 text-sm text-brand hover:underline">
        + Add line
      </button>

      <div className="mt-3 border-t border-line pt-3 text-right text-sm font-medium text-ink">
        Total: {currency} {total.toFixed(2)}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={cancel} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
