'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addProductVariant, setProductVariantActive } from '@/actions/products';

type Variant = { id: string; sku: string; name: string; attributes: unknown; priceAdjust: number; active: boolean };

export function VariantsPanel({ productId, variants, canWrite }: { productId: string; variants: Variant[]; canWrite: boolean }) {
  const router = useRouter();
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [attrs, setAttrs] = useState('');
  const [adjust, setAdjust] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // "size=70x140, colour=white" → { size: '70x140', colour: 'white' }
  const parseAttrs = () => Object.fromEntries(attrs.split(',').map((p) => p.split('=').map((x) => x.trim())).filter((kv) => kv.length === 2 && kv[0] && kv[1]) as [string, string][]);
  const run = (fn: () => Promise<unknown>) => { setError(null); startTransition(async () => { try { await fn(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); } }); };
  const f = 'rounded-lg border border-line px-3 py-2 text-sm text-ink';

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Variants</h2>
      {variants.length === 0 ? <p className="text-sm text-muted">No variants — the base product is sold as-is.</p> : (
        <ul className="divide-y divide-line text-sm">
          {variants.map((v) => (
            <li key={v.id} className={`flex items-center justify-between py-2 ${v.active ? '' : 'opacity-50'}`}>
              <div><span className="font-mono text-xs text-muted">{v.sku}</span> <span className="text-ink">{v.name}</span>
                {typeof v.attributes === 'object' && v.attributes !== null && <span className="ml-2 text-xs text-muted">{Object.entries(v.attributes as Record<string, string>).map(([k, val]) => `${k}: ${val}`).join(' · ')}</span>}
                {v.priceAdjust !== 0 && <span className="ml-2 text-xs text-muted">{v.priceAdjust > 0 ? '+' : ''}{v.priceAdjust}</span>}</div>
              {canWrite && <button disabled={pending} onClick={() => run(() => setProductVariantActive(productId, v.id, !v.active))} className="text-xs text-muted underline hover:text-ink">{v.active ? 'Deactivate' : 'Activate'}</button>}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="flex flex-wrap items-end gap-2">
          <input aria-label="Variant SKU" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} className={`${f} w-32`} />
          <input aria-label="Variant name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={`${f} w-40`} />
          <input aria-label="Attributes" placeholder="size=70x140, colour=white" value={attrs} onChange={(e) => setAttrs(e.target.value)} className={`${f} w-56`} />
          <input aria-label="Price adjustment" type="number" step="any" placeholder="± price" value={adjust} onChange={(e) => setAdjust(e.target.value)} className={`${f} w-24`} />
          <button disabled={pending || !sku.trim() || !name.trim()} onClick={() => run(async () => { await addProductVariant(productId, { sku, name, attributes: parseAttrs(), priceAdjust: adjust ? Number(adjust) : 0 }); setSku(''); setName(''); setAttrs(''); setAdjust(''); })} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Add variant</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
