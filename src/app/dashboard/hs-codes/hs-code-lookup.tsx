'use client';

import { useState, useTransition } from 'react';
import { lookupHsCode } from '@/actions/hs-codes';
import type { HsCode } from '@prisma/client';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { EmptyState } from '@/components/dashboard/empty-state';
import { FileSearch } from 'lucide-react';
import { AiDraftActions } from '@/components/ai-draft-actions';

type HsCodeRow = HsCode & { interactionId: string | null };

export function HsCodeLookup({ initialHistory }: { initialHistory: HsCode[] }) {
  const [description, setDescription] = useState('');
  const [history, setHistory] = useState<HsCodeRow[]>(initialHistory.map((h) => ({ ...h, interactionId: null })));
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

  const columns: DataTableColumn<HsCodeRow>[] = [
    { key: 'description', header: 'Description', render: (h) => h.description },
    { key: 'hsCode', header: 'HS code', render: (h) => <span className="font-medium text-ink">{h.hsCode}</span> },
    { key: 'dutyRatePct', header: 'Duty %', numeric: true, render: (h) => h.dutyRatePct ?? '—' },
    { key: 'rodtepRatePct', header: 'RoDTEP %', numeric: true, render: (h) => h.rodtepRatePct ?? '—' },
    { key: 'rationale', header: 'Rationale', render: (h) => h.rationale },
    {
      key: 'feedback',
      header: '',
      render: (h) => (h.interactionId ? <AiDraftActions interactionId={h.interactionId} /> : null),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-canvas p-4">
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

      <DataTable
        columns={columns}
        rows={history}
        rowKey={(h) => h.id}
        empty={<EmptyState icon={FileSearch} title="No lookups yet" description="Classify a product description to see its HS code, duty, and RoDTEP rate." />}
      />
    </div>
  );
}
