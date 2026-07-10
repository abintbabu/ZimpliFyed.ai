'use client';

import { useState, useTransition } from 'react';
import { updateTenantProfile } from '@/actions/tenant-settings';
import type { BusinessType } from '@prisma/client';

type Profile = {
  name: string;
  businessType: BusinessType | null;
  exportProducts: string | null;
  primaryMarkets: string[];
  legalName: string | null;
  registeredAddress: string | null;
  iecNumber: string | null;
  gstin: string | null;
  adCode: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfscOrSwift: string | null;
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
          legalName: String(formData.get('legalName') ?? ''),
          registeredAddress: String(formData.get('registeredAddress') ?? ''),
          iecNumber: String(formData.get('iecNumber') ?? ''),
          gstin: String(formData.get('gstin') ?? ''),
          adCode: String(formData.get('adCode') ?? ''),
          bankName: String(formData.get('bankName') ?? ''),
          bankAccountNumber: String(formData.get('bankAccountNumber') ?? ''),
          bankIfscOrSwift: String(formData.get('bankIfscOrSwift') ?? ''),
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

      <div className="sm:col-span-2">
        <h3 className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Export document identity
        </h3>
        <p className="mb-3 text-xs text-muted">
          Used to generate proforma/commercial invoices, packing lists, and certificates of origin.
        </p>
      </div>
      <input name="legalName" defaultValue={profile.legalName ?? ''} placeholder="Legal entity name" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" />
      <input name="registeredAddress" defaultValue={profile.registeredAddress ?? ''} placeholder="Registered address" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" />
      <input name="iecNumber" defaultValue={profile.iecNumber ?? ''} placeholder="IEC number" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="gstin" defaultValue={profile.gstin ?? ''} placeholder="GSTIN" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="adCode" defaultValue={profile.adCode ?? ''} placeholder="AD code" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="bankName" defaultValue={profile.bankName ?? ''} placeholder="Bank name" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="bankAccountNumber" defaultValue={profile.bankAccountNumber ?? ''} placeholder="Bank account number" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="bankIfscOrSwift" defaultValue={profile.bankIfscOrSwift ?? ''} placeholder="IFSC / SWIFT" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />

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
