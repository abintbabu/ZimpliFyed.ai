'use client';

import { useEffect, useState } from 'react';
import { listDocuments } from '@/actions/documents';
import { DocumentPanel } from '@/components/document-panel';
import type { ComplianceItem, Document } from '@prisma/client';

/** Attach scans of the actual certificate (IEC, LUT, RCMC…) to a compliance item. Loads files on selection. */
export function ComplianceFiles({ items, canWrite }: { items: ComplianceItem[]; canWrite: boolean }) {
  const [itemId, setItemId] = useState('');
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    listDocuments('compliance_items', itemId)
      .then((d) => { if (!cancelled) { setDocs(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load files'); });
    return () => { cancelled = true; };
  }, [itemId]);

  if (items.length === 0) return null;
  return (
    <section className="mt-6 space-y-3 rounded-2xl border border-line bg-white p-4">
      <h2 className="text-sm font-semibold text-ink">Certificate files</h2>
      <label className="block text-xs text-muted">Item
        <select
          aria-label="Compliance item"
          value={itemId}
          onChange={(e) => { setDocs(null); setError(null); setItemId(e.target.value); }}
          className="mt-1 block w-full max-w-sm rounded-lg border border-line px-3 py-2 text-sm text-ink"
        >
          <option value="">Select an item…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {itemId && docs && <DocumentPanel key={itemId} collection="compliance_items" documentId={itemId} initialDocuments={docs} canWrite={canWrite} />}
    </section>
  );
}
