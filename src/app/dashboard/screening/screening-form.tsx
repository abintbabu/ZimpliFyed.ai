'use client';

import { useState, useTransition } from 'react';
import { runScreeningCheck, recordManualScreeningResult } from '@/actions/screening';
import type { ScreeningCheck } from '@prisma/client';

export function ScreeningForm({ apiConfigured }: { apiConfigured: boolean }) {
  const [subjectName, setSubjectName] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [cleared, setCleared] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScreeningCheck | null>(null);

  function submit() {
    setError(null);
    setLastResult(null);
    startTransition(async () => {
      try {
        const result = apiConfigured
          ? await runScreeningCheck({ subjectName, country: country || undefined })
          : await recordManualScreeningResult({ subjectName, country: country || undefined, cleared, notes });
        setLastResult(result);
        setSubjectName('');
        setNotes('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Screening failed');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          placeholder="Buyer / consignee name"
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country (optional)"
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
        />
      </div>

      {!apiConfigured && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={cleared} onChange={() => setCleared(true)} /> Clear
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!cleared} onChange={() => setCleared(false)} /> Potential match
            </label>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Which list(s) did you check, and when? (e.g. 'Checked OFAC SDN search and trade.gov CSL on 2026-07-07')"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
            rows={2}
          />
        </div>
      )}

      <button
        onClick={submit}
        disabled={pending || !subjectName.trim() || (!apiConfigured && !notes.trim())}
        className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Checking…' : apiConfigured ? 'Screen now' : 'Record check'}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {lastResult && (
        <div className={`mt-3 rounded-lg p-3 text-sm ${
          lastResult.result === 'clear' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {lastResult.result === 'clear'
            ? `No match found for "${lastResult.subjectName}".`
            : `Potential match or manual flag for "${lastResult.subjectName}" — review before proceeding with this shipment.`}
        </div>
      )}
    </div>
  );
}
