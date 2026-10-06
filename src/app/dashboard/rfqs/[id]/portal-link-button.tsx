'use client';

import { useState, useTransition } from 'react';
import { createVendorPortalLink } from '@/actions/vendor-portal';

/** Issues a no-login quote link for one vendor. The link is shown once — only its hash is stored. */
export function PortalLinkButton({ rfqId, vendorId, vendorName }: { rfqId: string; vendorId: string; vendorName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink">{vendorName}</span>
      <button disabled={pending} onClick={() => { setError(null); setCopied(false); startTransition(async () => { try { const r = await createVendorPortalLink(rfqId, vendorId); setUrl(`${window.location.origin}${r.path}`); } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the link'); } }); }} className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink disabled:opacity-50">{url ? 'Re-issue link' : 'Get quote link'}</button>
      {url && (
        <>
          <input readOnly aria-label={`Quote link for ${vendorName}`} value={url} onFocus={(e) => e.currentTarget.select()} className="w-72 rounded border border-line px-2 py-1 text-xs text-ink" />
          <button onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))} className="text-xs text-brand underline">{copied ? 'Copied' : 'Copy'}</button>
          <span className="text-xs text-muted">Shown once · valid 14 days · re-issuing replaces it</span>
        </>
      )}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
