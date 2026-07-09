'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { checkSlug, createOrganization } from '@/actions/onboarding';

const MARKETS = [
  ['AE', 'UAE'], ['SA', 'Saudi Arabia'], ['US', 'United States'], ['GB', 'United Kingdom'],
  ['FR', 'France'], ['DE', 'Germany'], ['NL', 'Netherlands'], ['AU', 'Australia'],
  ['SG', 'Singapore'], ['JP', 'Japan'], ['CA', 'Canada'], ['ZA', 'South Africa'],
] as const;

type BusinessType = 'merchant' | 'manufacturer' | 'both';

export function CreateOrgWizard({ defaultName }: { defaultName: string }) {
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<{ available: boolean; reason?: string } | null>(null);
  const [businessType, setBusinessType] = useState<BusinessType>('merchant');
  const [exportProducts, setExportProducts] = useState('');
  const [primaryMarkets, setPrimaryMarkets] = useState<string[]>([]);
  const [teamSizeBand, setTeamSizeBand] = useState('1-5');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live slug suggestion from company name (until user hand-edits the slug).
  useEffect(() => {
    if (slugEdited) return;
    const s = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    setSlug(s);
  }, [companyName, slugEdited]);

  // Debounced availability check.
  useEffect(() => {
    if (slug.length < 3) { setSlugState(null); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const r = await checkSlug(slug);
      setSlugState({ available: r.available, reason: r.reason });
      if (r.slug !== slug) setSlug(r.slug);
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [slug]);

  const canSubmit = companyName.trim().length >= 2 && slug.length >= 3 && slugState?.available && !pending;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createOrganization({
        companyName: companyName.trim(),
        slug,
        businessType,
        exportProducts: exportProducts.trim() || undefined,
        primaryMarkets,
        teamSizeBand: teamSizeBand as '1-5' | '6-20' | '21-50' | '50+',
      });
      // Success redirects server-side; only errors return here.
      if (res && 'error' in res) setError(res.error);
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-8 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.22)]">
      <label className="block text-sm font-medium text-ink">Company name</label>
      <input
        autoFocus
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        placeholder={defaultName || 'Acme Exports Pvt Ltd'}
        className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      />

      <label className="mt-4 block text-sm font-medium text-ink">Workspace address</label>
      <div className="mt-1 flex items-center rounded-lg border border-line px-3 py-2 focus-within:border-brand">
        <input
          value={slug}
          onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase()); }}
          className="w-full bg-transparent text-sm text-ink outline-none"
        />
        <span className="text-xs text-muted">.zimplifyed.ai</span>
      </div>
      {slug.length >= 3 && slugState && (
        <p className={`mt-1 text-xs ${slugState.available ? 'text-success' : 'text-danger'}`}>
          {slugState.available ? '✓ Available' : slugState.reason ?? 'Unavailable'}
        </p>
      )}

      <label className="mt-4 block text-sm font-medium text-ink">Business type</label>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {(['merchant', 'manufacturer', 'both'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setBusinessType(t)}
            className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize ${businessType === t ? 'border-brand bg-brand/5 text-brand' : 'border-line text-ink-soft'}`}
          >
            {t === 'merchant' ? 'Merchant exporter' : t}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-sm font-medium text-ink">What do you export?</label>
      <input
        value={exportProducts}
        onChange={(e) => setExportProducts(e.target.value)}
        placeholder="e.g. cotton towels, bathrobes"
        maxLength={200}
        className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      />

      <label className="mt-4 block text-sm font-medium text-ink">Primary markets <span className="text-muted">(up to 5)</span></label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {MARKETS.map(([code, name]) => {
          const on = primaryMarkets.includes(code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => setPrimaryMarkets((prev) => on ? prev.filter((c) => c !== code) : prev.length < 5 ? [...prev, code] : prev)}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand bg-brand/5 text-brand' : 'border-line text-ink-soft'}`}
            >
              {name}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block text-sm font-medium text-ink">Team size</label>
      <select
        value={teamSizeBand}
        onChange={(e) => setTeamSizeBand(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      >
        {['1-5', '6-20', '21-50', '50+'].map((b) => <option key={b} value={b}>{b} people</option>)}
      </select>

      {error && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        className="mt-6 w-full rounded-lg bg-brand-gradient py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: canSubmit ? undefined : '#94a3b8' }}
      >
        {pending ? 'Creating…' : 'Create workspace'}
      </button>
    </div>
  );
}
