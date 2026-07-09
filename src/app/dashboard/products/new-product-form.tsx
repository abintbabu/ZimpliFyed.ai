'use client';

import { useState, useTransition } from 'react';
import { createProduct } from '@/actions/products';

export function NewProductForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    const sku = String(formData.get('sku') ?? '').trim();
    const name = String(formData.get('name') ?? '').trim();
    if (!sku || !name) return;
    startTransition(async () => {
      try {
        await createProduct({
          sku,
          name,
          category: String(formData.get('category') ?? ''),
          uom: String(formData.get('uom') ?? 'pcs'),
          description: String(formData.get('description') ?? ''),
        });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create product');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        New product
      </button>
    );
  }

  return (
    <form action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2">
      <input name="sku" required placeholder="SKU" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="name" required placeholder="Product name" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="category" placeholder="Category" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="uom" placeholder="Unit of measure (pcs)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <textarea name="description" placeholder="Description / specs" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" />
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
