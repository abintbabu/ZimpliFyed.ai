'use client';

import { useState, useTransition } from 'react';
import { reviewLetterOfCredit, addLetterOfCredit, saveLcTerms, getLcPresentationCheck, proposeLcTerms } from '@/actions/letters-of-credit';
import { lcDeadlineAlerts } from '@/lib/lc-deadlines';
import { AiDraftActions } from '@/components/ai-draft-actions';
import { usePlanGate } from '@/lib/billing/use-plan-gate';
import { UpsellSheet } from '@/components/upsell-sheet';
import { AdvisoryDisclaimer } from '@/components/advisory-disclaimer';

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
  amount?: number | null;
  currency?: string | null;
  expiryDate?: Date | null;
  latestShipmentDate?: Date | null;
  requiredDocuments?: unknown;
  status?: LcStatusValue;
};

type LcStatusValue = 'draft' | 'advised' | 'amended' | 'documents_presented' | 'accepted' | 'paid' | 'expired' | 'cancelled';
const STATUSES: LcStatusValue[] = ['draft', 'advised', 'amended', 'documents_presented', 'accepted', 'paid', 'expired', 'cancelled'];
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** Runs the mechanical pre-check on demand and lists the document checklist with its findings. */
function PresentationCheck({ lcId }: { lcId: string }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof getLcPresentationCheck>> | null>(null);
  const [pending, startTransition] = useTransition();
  const mark = { ready: '✓', missing: '✗', manual: '?' } as const;
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Presentation pre-check</p>
        <button disabled={pending} onClick={() => startTransition(async () => setState(await getLcPresentationCheck(lcId)))} className="rounded-lg border border-line px-3 py-1 text-xs text-ink disabled:opacity-50">{pending ? 'Checking…' : state ? 'Re-check' : 'Run check'}</button>
      </div>
      {state && 'unavailable' in state && <p role="alert" className="text-xs text-red-700">{state.unavailable}</p>}
      {state && 'check' in state && (
        <>
          <p role="status" className={`text-sm font-medium ${state.check.ready ? 'text-green-700' : 'text-red-700'}`}>{state.check.ready ? 'No mechanical discrepancies found' : 'Discrepancies found'}{state.check.daysLeft != null && <span className="ml-2 text-xs font-normal text-muted">{state.check.daysLeft >= 0 ? `${state.check.daysLeft} day(s) left to present` : 'presentation window closed'}</span>}</p>
          {state.checklist.length > 0 && <ul className="space-y-0.5 text-xs">{state.checklist.map((c, i) => <li key={i} className={c.status === 'ready' ? 'text-green-700' : c.status === 'missing' ? 'text-red-700' : 'text-amber-800'}>{mark[c.status]} {c.text}</li>)}</ul>}
          <ul className="space-y-0.5 text-xs">{state.check.findings.filter((f) => f.severity !== 'ok').map((f, i) => <li key={i} className={f.severity === 'error' ? 'text-red-700' : 'text-amber-800'}>{f.severity === 'error' ? '✗' : '⚠'} {f.message}</li>)}</ul>
          <p className="text-xs text-muted">Advisory — the issuing and nominated banks decide. Subtler LC conditions are not checked here.</p>
        </>
      )}
    </div>
  );
}

/** Editable structured terms for one LC — drives deadline alerts and the daily brief. */
function LcTermsForm({ lc, orderShipped, canWrite, onSaved }: { lc: Lc; orderShipped: boolean; canWrite: boolean; onSaved: (patch: Partial<Lc>) => void }) {
  const [amount, setAmount] = useState(lc.amount != null ? String(lc.amount) : '');
  const [currency, setCurrency] = useState(lc.currency ?? '');
  const [expiry, setExpiry] = useState(iso(lc.expiryDate));
  const [latestShip, setLatestShip] = useState(iso(lc.latestShipmentDate));
  const [docs, setDocs] = useState(((lc.requiredDocuments as string[] | null) ?? []).join('\n'));
  const [status, setStatus] = useState<LcStatusValue>(lc.status ?? 'draft');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [proposeMsg, setProposeMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const alerts = lcDeadlineAlerts(
    { status, expiryDate: expiry ? new Date(`${expiry}T00:00:00Z`) : null, latestShipmentDate: latestShip ? new Date(`${latestShip}T00:00:00Z`) : null },
    orderShipped,
    new Date(),
  );

  /** Pre-fills the form from the LC text. Nothing is saved until the user reviews and presses Save. */
  function propose() {
    setProposeMsg(null);
    startTransition(async () => {
      try {
        const r = await proposeLcTerms(lc.id);
        if ('unavailable' in r) { setProposeMsg(r.unavailable); return; }
        const t = r.terms;
        if (t.amount != null) setAmount(String(t.amount));
        if (t.currency) setCurrency(t.currency.toUpperCase());
        if (t.expiryDate) setExpiry(t.expiryDate);
        if (t.latestShipmentDate) setLatestShip(t.latestShipmentDate);
        if (t.requiredDocuments.length) setDocs(t.requiredDocuments.join('\n'));
        setSaved(false);
        setProposeMsg('Filled from the LC text by AI — check every figure against the LC itself, then save.');
      } catch (e) { setProposeMsg(e instanceof Error ? e.message : 'Could not read the LC text'); }
    });
  }

  function save() {
    setError(null); setSaved(false);
    startTransition(async () => {
      try {
        const requiredDocuments = docs.split('\n').map((d) => d.trim()).filter(Boolean);
        const res = await saveLcTerms(lc.id, {
          amount: amount ? Number(amount) : null, currency: currency || null,
          expiryDate: expiry || null, latestShipmentDate: latestShip || null, requiredDocuments, status,
        });
        setWarnings(res.warnings);
        setSaved(true);
        onSaved({ amount: amount ? Number(amount) : null, currency: currency || null, expiryDate: expiry ? new Date(expiry) : null, latestShipmentDate: latestShip ? new Date(latestShip) : null, requiredDocuments, status });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save LC terms');
      }
    });
  }

  const field = 'w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink disabled:bg-transparent';
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">LC terms</p>
      {alerts.map((a) => (
        <p key={a.kind} role="status" className={`rounded px-2 py-1 text-xs font-medium ${a.severity === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
          {a.kind === 'shipment' ? 'Latest shipment date' : 'Expiry'} {a.overdue ? `passed ${-a.daysLeft} day(s) ago` : a.daysLeft === 0 ? 'is today' : `in ${a.daysLeft} day(s)`}
        </p>
      ))}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-muted">Amount<input aria-label="LC amount" type="number" min={0} step="any" disabled={!canWrite} value={amount} onChange={(e) => setAmount(e.target.value)} className={field} /></label>
        <label className="text-xs text-muted">Currency<input aria-label="LC currency" disabled={!canWrite} value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={field} /></label>
        <label className="text-xs text-muted">Latest shipment<input aria-label="Latest shipment date" type="date" disabled={!canWrite} value={latestShip} onChange={(e) => setLatestShip(e.target.value)} className={field} /></label>
        <label className="text-xs text-muted">Expiry<input aria-label="LC expiry" type="date" disabled={!canWrite} value={expiry} onChange={(e) => setExpiry(e.target.value)} className={field} /></label>
      </div>
      <label className="block text-xs text-muted">Required documents (one per line)
        <textarea aria-label="Required documents" rows={3} disabled={!canWrite} value={docs} onChange={(e) => setDocs(e.target.value)} className={field} />
      </label>
      <label className="block text-xs text-muted">Status
        <select aria-label="LC status" disabled={!canWrite} value={status} onChange={(e) => setStatus(e.target.value as LcStatusValue)} className={field}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </label>
      {warnings.map((w, i) => <p key={i} role="alert" className="text-xs text-amber-800">⚠ {w}</p>)}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {canWrite && lc.workable !== undefined && (
        <button disabled={pending} onClick={propose} className="mr-2 rounded-lg border border-line px-3 py-1.5 text-xs text-ink disabled:opacity-50">Fill from LC text (AI)</button>
      )}
      {proposeMsg && <p role="status" className="text-xs text-amber-800">{proposeMsg}</p>}
      {canWrite && (
        <button disabled={pending} onClick={save} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save terms'}
        </button>
      )}
    </div>
  );
}

export function LcAdvisorPanel({
  orderId,
  initialLcs,
  canWrite,
  orderShipped = false,
}: {
  orderId: string;
  initialLcs: Lc[];
  canWrite: boolean;
  orderShipped?: boolean;
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

  function handleAddWithoutReview() {
    setError(null);
    startTransition(async () => {
      try {
        const lc = await addLetterOfCredit({ orderId, lcNumber: lcNumber || undefined, issuingBank: issuingBank || undefined, rawText });
        setLcs((prev) => [lc, ...prev]);
        setExpanded(lc.id);
        setRawText('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add LC');
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
          <button
            onClick={handleAddWithoutReview}
            disabled={pending}
            className="ml-2 rounded-lg border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            Track LC without AI review
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
                  {lc.workable == null ? (
                    <span className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-muted">Not reviewed</span>
                  ) : (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${lc.workable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {lc.workable ? 'Workable' : 'Needs revision'}
                    </span>
                  )}
                </button>
                {expanded === lc.id && (
                  <div className="mt-2 rounded-lg bg-surface p-3 text-sm">
                    {lc.reviewSummary && <p className="mb-2 text-ink">{lc.reviewSummary}</p>}
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
                    <PresentationCheck lcId={lc.id} />
                    <LcTermsForm
                      lc={lc}
                      orderShipped={orderShipped}
                      canWrite={canWrite}
                      onSaved={(patch) => setLcs((prev) => prev.map((x) => (x.id === lc.id ? { ...x, ...patch } : x)))}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4">
        <AdvisoryDisclaimer kind="lc" />
      </div>
    </section>
  );
}
