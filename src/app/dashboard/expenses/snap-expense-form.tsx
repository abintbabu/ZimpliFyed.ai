'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { snapExpenseAction } from '@/actions/expenses';

/** Upload a receipt/invoice/UPI screenshot. Submits multipart to the server action, which uploads the file,
 * creates a pending Expense, and queues the vision pipeline — the row shows up in the list on refresh. */
export function SnapExpenseForm({ orders }: { orders: { id: string; orderNumber: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const submit = (formData: FormData) => {
    setError(null);
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a photo or PDF of the receipt');
      return;
    }
    startTransition(async () => {
      try {
        await snapExpenseAction(formData);
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        Snap expense
      </button>
    );
  }

  return (
    <form ref={formRef} action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-canvas p-4 dark:bg-surface sm:grid-cols-2">
      <input
        name="file"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        required
        className="rounded-lg border border-line px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-brand"
      />
      <select name="orderId" className="rounded-lg border border-line px-3 py-2 text-sm text-ink">
        <option value="">Attribute to order (optional)…</option>
        {orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}
      </select>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Uploading…' : 'Upload & extract'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}
