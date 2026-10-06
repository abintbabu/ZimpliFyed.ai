'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createForwarder, setForwarderActive } from '@/actions/forwarders';

export function ForwarderForm() {
  const router = useRouter();
  const [v, setV] = useState({ name: '', contactName: '', email: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const f = 'rounded-lg border border-line px-3 py-2 text-sm text-ink';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(['name', 'contactName', 'email', 'phone'] as const).map((k) => (
          <input key={k} aria-label={k} placeholder={{ name: 'Forwarder name', contactName: 'Contact', email: 'Email', phone: 'Phone' }[k]} value={v[k]} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} className={`${f} ${k === 'name' ? 'w-56' : 'w-44'}`} />
        ))}
        <button disabled={pending || !v.name.trim()} onClick={() => { setError(null); startTransition(async () => { try { await createForwarder(v); setV({ name: '', contactName: '', email: '', phone: '' }); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not add'); } }); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add forwarder</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function ForwarderToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button disabled={pending} onClick={() => startTransition(async () => { await setForwarderActive(id, !active); router.refresh(); })} className="text-xs text-muted underline hover:text-ink">{active ? 'Deactivate' : 'Activate'}</button>;
}
