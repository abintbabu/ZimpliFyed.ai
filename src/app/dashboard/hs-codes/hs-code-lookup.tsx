'use client';

import { useState, useTransition } from 'react';
import { lookupHsCode } from '@/actions/hs-codes';
import type { HsCode } from '@prisma/client';

export function HsCodeLookup({ initialHistory }: { initialHistory: HsCode[] }) {
  const [description, setDescription] = useState('');
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLookup() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await lookupHsCode(description);
        setHistory((prev) => [result, ...prev.filter((h) => h.id !== result.id)]);
        setDescription('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lookup failed');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex gap-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the product, e.g. 'Cotton terry bath towel, 500 GSM'"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
          <button
            onClick={handleLookup}
            disabled={pending || !description.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Classifying…' : 'Classify'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">HS code</th>
              <th className="px-4 py-3">Duty %</th>
              <th className="px-4 py-3">RoDTEP %</th>
              <th className="px-4 py-3">Rationale</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-t border-line align-top">
                <td className="px-4 py-3 text-ink">{h.description}</td>
                <td className="px-4 py-3 font-medium text-ink">{h.hsCode}</td>
                <td className="px-4 py-3 text-muted">{h.dutyRatePct ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{h.rodtepRatePct ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{h.rationale}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No lookups yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
