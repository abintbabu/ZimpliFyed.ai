'use client';

import { useState, useTransition } from 'react';
import { createContact } from '@/actions/buyers';

export function NewContactForm({ buyerId }: { buyerId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await createContact({
          buyerId,
          name,
          email: String(formData.get('email') ?? ''),
          phone: String(formData.get('phone') ?? ''),
          role: String(formData.get('role') ?? ''),
        });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add contact');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-brand hover:underline">
        + Add contact
      </button>
    );
  }

  return (
    <form action={submit} className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2">
      <input name="name" required placeholder="Name" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="role" placeholder="Role (e.g. Buyer)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="email" type="email" placeholder="Email" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="phone" placeholder="Phone / WhatsApp" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
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
