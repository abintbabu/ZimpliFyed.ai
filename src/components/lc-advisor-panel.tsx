'use client';

import { useState, useTransition } from 'react';
import { reviewLetterOfCredit } from '@/actions/letters-of-credit';
import { AiDraftActions } from '@/components/ai-draft-actions';
import { usePlanGate } from '@/lib/billing/use-plan-gate';
import { UpsellSheet } from '@/components/upsell-sheet';

type LcIssue = { clause: string; issue: string; severity: 'low' | 'medium' | 'high' };

type Lc = {
  id: string;
  lcNumber: string | null;
  issuingBank: string | null;
  workable: boolean | null;
  reviewSummary: string | null;
  issues: unknown;
  createdAt: Date;
  interactionId?: string | null;
};

export function LcAdvisorPanel({
  orderId,
  initialLcs,
  canWrite,
}: {
  orderId: string;
  initialLcs: Lc[];
  canWrite: boolean;
}) {
  const [lcs, setLcs] = useState(initialLcs);
  const [lcNumber, setLcNumber] = useState('');
  const [issuingBank, setIssuingBank] = useState('');
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { gate, tryOpenFromError, close } = usePlanGate();

  function handleReview() {
    setError(null);
    startTransition(async () => {
      try {
        const lc = await reviewLetterOfCredit({ orderId, lcNumber: lcNumber || undefined, issuingBank: issuingBank || undefined, rawText });
        setLcs((prev) => [lc, ...prev]);
        setExpanded(lc.id);
        setRawText('');
      } catch (err) {
        if (!tryOpenFromError(err)) setError(err instanceof Error ? err.message : 'LC review failed');
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      {gate && <UpsellSheet feature={gate} onClose={close} />}
      <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">LC advisor</h2>
      <p className="mb-3 text-xs text-muted">AI review of draft LC terms — advisory only, your bank makes the final determination.</p>

      {canWrite && (
        <div className="mb-4 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={lcNumber} onChange={(e) => setLcNumber(e.target.value)} placeholder="LC number (optional)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
            <input value={issuingBank} onChange={(e) => setIssuingBank(e.target.value)} placeholder="Issuing bank (optional)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the draft LC text here…"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
            rows={5}
          />
          <button
            onClick={handleReview}
            disabled={pending || !rawText.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Reviewing…' : 'Review LC terms'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {lcs.length === 0 ? (
        <p className="text-sm text-muted">No LCs reviewed yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {lcs.map((lc) => {
            const issues = (lc.issues as LcIssue[] | null) ?? [];
            return (
              <li key={lc.id} className="py-2">
                <button
                  onClick={() => setExpanded(expanded === lc.id ? null : lc.id)}
                  className="flex w-full items-center justify-between text-left text-sm"
                >
                  <span className="text-ink">
                    {lc.lcNumber ?? 'Untitled LC'} {lc.issuingBank ? `— ${lc.issuingBank}` : ''}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${lc.workable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {lc.workable ? 'Workable' : 'Needs revision'}
                  </span>
                </button>
                {expanded === lc.id && (
                  <div className="mt-2 rounded-lg bg-surface p-3 text-sm">
                    <p className="mb-2 text-ink">{lc.reviewSummary}</p>
                    {issues.length > 0 && (
                      <ul className="space-y-2">
                        {issues.map((issue, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <span className={`mt-0.5 rounded px-1.5 py-0.5 font-medium ${
                              issue.severity === 'high' ? 'bg-red-100 text-red-700' :
                              issue.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-white text-muted'
                            }`}>
                              {issue.severity}
                            </span>
                            <span className="text-ink"><strong>{issue.clause}:</strong> {issue.issue}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {lc.interactionId && (
                      <div className="mt-3">
                        <AiDraftActions interactionId={lc.interactionId} />
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
