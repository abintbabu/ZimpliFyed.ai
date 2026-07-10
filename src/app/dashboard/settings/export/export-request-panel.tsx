'use client';

import { useState, useTransition } from 'react';
import { requestDataExport } from '@/actions/data-export';

export function ExportRequestPanel() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);

  function handleExport() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await requestDataExport();
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <button
        onClick={handleExport}
        disabled={pending}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Building your export…' : 'Request export'}
      </button>
      <p className="mt-2 text-xs text-muted">Limited to one export per day. The link expires in 24 hours.</p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg bg-surface p-4 text-sm">
          <p className="text-ink">Your export is ready.</p>
          <a href={result.url} className="mt-1 inline-block text-brand hover:underline">
            Download export.zip
          </a>
          <p className="mt-1 text-xs text-muted">Link expires {new Date(result.expiresAt).toLocaleString()}.</p>
        </div>
      )}
    </div>
  );
}
