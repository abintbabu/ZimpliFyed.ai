'use client';

import { useState, useTransition } from 'react';
import { createQuote } from '@/actions/quotes';
import { getPriceForBuyerProduct } from '@/actions/price-lists';
import { DEFAULT_EXPENSE_PCT, DEFAULT_MARGIN_PCT } from '@/lib/pricing-buildup';

type Line = { productId: string; description: string; quantity: string; cost: string; expensePct: string; marginPct: string; unitPrice: string };

const emptyLine = (): Line => ({
  productId: '',
  description: '',
  quantity: '1',
  cost: '',
  expensePct: String(DEFAULT_EXPENSE_PCT),
  marginPct: String(DEFAULT_MARGIN_PCT),
  unitPrice: '',
});

export function NewQuoteForm({
  buyers,
  products,
  canOverrideMarginFloor,
}: {
  buyers: { id: string; name: string }[];
  products: { id: string; sku: string; name: string }[];
  canOverrideMarginFloor: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [incoterm, setIncoterm] = useState('FOB');
  const [overrideMarginFloor, setOverrideMarginFloor] = useState(false);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const pickProduct = (i: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    updateLine(i, { productId, description: product ? `${product.sku} — ${product.name}` : lines[i].description });
    if (productId && buyerId) {
      startTransition(async () => {
        const price = await getPriceForBuyerProduct(buyerId, productId, incoterm).catch(() => null);
        if (price != null) updateLine(i, { unitPrice: String(price) });
      });
    }
  };

  const submit = () => {
    setError(null);
    if (!quoteNumber.trim()) return;
    startTransition(async () => {
      try {
        await createQuote({
          quoteNumber: quoteNumber.trim(),
          buyerId: buyerId || undefined,
          overrideMarginFloor,
          lines: lines
            .filter((l) => l.description.trim() && l.cost)
            .map((l) => ({
              productId: l.productId || undefined,
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
        setBuyerId('');
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
      <div className="flex flex-wrap gap-2">
        <input
          value={quoteNumber}
          onChange={(e) => setQuoteNumber(e.target.value)}
          required
          placeholder="Quote number"
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:w-56"
        />
        <select
          value={buyerId}
          onChange={(e) => setBuyerId(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
        >
          <option value="">No buyer</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select
          value={incoterm}
          onChange={(e) => setIncoterm(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
        >
          {['FOB', 'CIF', 'CFR', 'EXW', 'DDP'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <select
              value={l.productId}
              onChange={(e) => pickProduct(i, e.target.value)}
              className="rounded-lg border border-line px-2 py-2 text-sm text-ink"
            >
              <option value="">Free text</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku}</option>
              ))}
            </select>
            <input
              value={l.description}
              onChange={(e) => updateLine(i, { description: e.target.value })}
              placeholder="Description"
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
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

      {canOverrideMarginFloor && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={overrideMarginFloor} onChange={(e) => setOverrideMarginFloor(e.target.checked)} />
          Allow saving lines below the margin floor
        </label>
      )}

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
