'use client';

import { useState, useTransition } from 'react';
import { createComplianceItem } from '@/actions/compliance';
import { COMPLIANCE_CATEGORY_LABELS } from '@/lib/compliance-deadlines';
import { usePlanGate } from '@/lib/billing/use-plan-gate';
import { UpsellSheet } from '@/components/upsell-sheet';
import type { ComplianceCategory } from '@prisma/client';

const CATEGORIES = Object.keys(COMPLIANCE_CATEGORY_LABELS) as ComplianceCategory[];

export function NewComplianceItemForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { gate, tryOpenFromError, close } = usePlanGate();

  const submit = (formData: FormData) => {
    setError(null);
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const expiresAtRaw = String(formData.get('expiresAt') ?? '');
        const issuedAtRaw = String(formData.get('issuedAt') ?? '');
        await createComplianceItem({
          category: String(formData.get('category') ?? 'other') as ComplianceCategory,
          name,
          issuingAuthority: String(formData.get('issuingAuthority') ?? ''),
          documentNumber: String(formData.get('documentNumber') ?? ''),
          issuedAt: issuedAtRaw ? new Date(issuedAtRaw) : undefined,
          expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : undefined,
          renewalLeadDays: Number(formData.get('renewalLeadDays') ?? 30),
          notes: String(formData.get('notes') ?? ''),
        });
        setOpen(false);
      } catch (err) {
        if (!tryOpenFromError(err)) setError(err instanceof Error ? err.message : 'Failed to add compliance item');
      }
    });
  };

  if (!open) {
    return (
      <>
        <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          Add item
        </button>
        {gate && <UpsellSheet feature={gate} onClose={close} />}
      </>
    );
  }

  return (
    <>
    <form action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2">
      <select name="category" className="rounded-lg border border-line px-3 py-2 text-sm text-ink">
        {CATEGORIES.map((c) => <option key={c} value={c}>{COMPLIANCE_CATEGORY_LABELS[c]}</option>)}
      </select>
      <input name="name" required placeholder="Name (e.g. IEC Certificate)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="issuingAuthority" placeholder="Issuing authority" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="documentNumber" placeholder="Document number" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <label className="text-xs text-muted">
        Issued on
        <input name="issuedAt" type="date" className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      </label>
      <label className="text-xs text-muted">
        Expires on
        <input name="expiresAt" type="date" className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      </label>
      <label className="text-xs text-muted sm:col-span-2">
        Renewal lead time (days before expiry to flag)
        <input name="renewalLeadDays" type="number" defaultValue={30} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      </label>
      <textarea name="notes" placeholder="Notes" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" rows={2} />

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
    {gate && <UpsellSheet feature={gate} onClose={close} />}
    </>
  );
}
