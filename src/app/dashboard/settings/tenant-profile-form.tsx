'use client';

import { useState, useTransition } from 'react';
import { updateTenantProfile } from '@/actions/tenant-settings';
import type { BusinessType } from '@prisma/client';

type Profile = {
  name: string;
  businessType: BusinessType | null;
  exportProducts: string | null;
  primaryMarkets: string[];
};

export function TenantProfileForm({ profile }: { profile: Profile }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = (formData: FormData) => {
    setError(null);
    setSaved(false);
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await updateTenantProfile({
          name,
          businessType: (String(formData.get('businessType') ?? '') || '') as BusinessType | '',
          exportProducts: String(formData.get('exportProducts') ?? ''),
          primaryMarkets: String(formData.get('primaryMarkets') ?? ''),
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update company profile');
      }
    });
  };

  return (
    <form action={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input name="name" required defaultValue={profile.name} placeholder="Company name" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" />
      <select name="businessType" defaultValue={profile.businessType ?? ''} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">
        <option value="">Business type…</option>
        <option value="merchant">Merchant exporter</option>
        <option value="manufacturer">Manufacturer-exporter</option>
        <option value="both">Both</option>
      </select>
      <input name="exportProducts" defaultValue={profile.exportProducts ?? ''} placeholder="Products exported" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="primaryMarkets" defaultValue={profile.primaryMarkets.join(', ')} placeholder="Primary markets (comma separated)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        {saved && !pending && <p className="text-sm text-success">Saved</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
