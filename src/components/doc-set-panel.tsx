'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, FileText, Link2, Printer, Sparkles } from 'lucide-react';
import {
  generateDocSetAction,
  approveDocSetAction,
  revokeDocSetShareLink,
} from '@/actions/doc-sets';
import { DOC_TITLE, type DocType } from '@/lib/doc-engine/models';
import { usePlanGate } from '@/lib/billing/use-plan-gate';
import { UpsellSheet } from '@/components/upsell-sheet';
import { AdvisoryDisclaimer } from '@/components/advisory-disclaimer';

type Finding = {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  docTypes: DocType[];
  message: string;
  source?: 'rule' | 'ai';
  suggestion?: string;
};

export type DocSetView = {
  id: string;
  version: number;
  status: string;
  shareToken: string | null;
  expiresAt: string | Date | null;
  approvedAt: string | Date | null;
  createdAt: string | Date;
  findings: Finding[];
  documents: { id: string; type: DocType; docNumber: string | null }[];
} | null;

const SEVERITY_ORDER: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 };

const SEVERITY_STYLE: Record<Finding['severity'], string> = {
  error: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-surface text-muted',
};

export function DocSetPanel({
  orderId,
  initialDocSet,
  canWrite,
}: {
  orderId: string;
  initialDocSet: DocSetView;
  canWrite: boolean;
}) {
  const [docSet, setDocSet] = useState<DocSetView>(initialDocSet);
  const [missing, setMissing] = useState<{ label: string; fixHref: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const { gate, tryOpenFromError, close } = usePlanGate();

  function refresh(view: NonNullable<DocSetView>) {
    setDocSet(view);
  }

  function handleGenerate() {
    setError(null);
    setMissing(null);
    startTransition(async () => {
      try {
        const result = await generateDocSetAction(orderId);
        if (!result.ok) {
          setMissing(result.missing.map((m) => ({ label: m.label, fixHref: m.fixHref })));
          return;
        }
        refresh({
          id: result.docSetId,
          version: result.version,
          status: 'draft',
          shareToken: docSet?.id === result.docSetId ? docSet.shareToken : null,
          expiresAt: null,
          approvedAt: null,
          createdAt: new Date(),
          findings: result.findings as Finding[],
          documents: result.models.map((m) => ({ id: m.docNumber, type: m.type, docNumber: m.docNumber })),
        });
      } catch (err) {
        if (!tryOpenFromError(err)) setError(err instanceof Error ? err.message : 'Failed to generate documents');
      }
    });
  }

  function handleApprove() {
    if (!docSet) return;
    setError(null);
    startTransition(async () => {
      try {
        await approveDocSetAction(docSet.id);
        refresh({ ...docSet, status: 'approved', approvedAt: new Date() });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to approve');
      }
    });
  }

  function handleRevoke() {
    if (!docSet) return;
    setError(null);
    startTransition(async () => {
      try {
        await revokeDocSetShareLink(docSet.id);
        refresh({ ...docSet, shareToken: null, expiresAt: null });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revoke link');
      }
    });
  }

  async function copyShareLink() {
    if (!docSet?.shareToken) return;
    const url = `${window.location.origin}/doc-set/${docSet.shareToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const findings = docSet ? [...docSet.findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) : [];
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const canApprove = docSet && docSet.status === 'draft' && errorCount === 0;

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      {gate && <UpsellSheet feature={gate} onClose={close} />}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Document set</h2>
        {docSet && (
          <span className="text-xs text-muted">
            v{docSet.version} · <span className="capitalize">{docSet.status}</span>
          </span>
        )}
      </div>

      {canWrite && (
        <button
          onClick={handleGenerate}
          disabled={pending}
          className="mb-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <FileText className="h-4 w-4" />
          {pending ? 'Generating…' : docSet ? 'Regenerate cross-checked set' : 'Generate cross-checked set'}
        </button>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {missing && (
        <div className="mb-3 overflow-hidden rounded-lg border border-amber-200">
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            <AlertCircle className="h-4 w-4" />
            {missing.length} field{missing.length > 1 ? 's' : ''} needed before documents can be generated
          </div>
          <ul className="divide-y divide-line-soft">
            {missing.map((m) => (
              <li key={m.fixHref + m.label} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-ink-soft">{m.label}</span>
                <Link href={m.fixHref} className="text-brand hover:underline">Fix</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {docSet && (
        <>
          <ul className="mb-3 divide-y divide-line">
            {docSet.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{DOC_TITLE[d.type]}</span>
                <span className="font-mono text-xs text-muted">{d.docNumber ?? '—'}</span>
              </li>
            ))}
          </ul>

          <div className="mb-3">
            {findings.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" /> No cross-document issues found.
              </p>
            ) : (
              <ul className="space-y-2">
                {findings.map((f, i) => (
                  <li key={f.ruleId + i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_STYLE[f.severity]}`}>
                      {f.severity}
                    </span>
                    <span className="text-ink">
                      {f.source === 'ai' && <Sparkles className="mr-1 inline h-3 w-3 text-brand" />}
                      {f.message}
                      {f.suggestion && <span className="block text-xs text-muted">Suggestion: {f.suggestion}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canWrite && canApprove && (
              <button
                onClick={handleApprove}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve set
              </button>
            )}
            {canWrite && docSet.status === 'draft' && errorCount > 0 && (
              <span className="text-xs text-muted">Resolve {errorCount} blocking issue{errorCount > 1 ? 's' : ''} to approve.</span>
            )}

            <a
              href={`/dashboard/orders/${orderId}/doc-set/print`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
            >
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </a>

            {docSet.shareToken ? (
              <>
                <button
                  onClick={copyShareLink}
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
                >
                  <Link2 className="h-4 w-4" /> {copied ? 'Copied!' : 'Copy buyer link'}
                </button>
                {canWrite && (
                  <button onClick={handleRevoke} disabled={pending} className="text-xs text-muted hover:text-red-600 disabled:opacity-50">
                    Revoke link
                  </button>
                )}
              </>
            ) : (
              canWrite && <span className="text-xs text-muted">Share link revoked — regenerate the set to issue a new one.</span>
            )}
          </div>
        </>
      )}

      {!docSet && !missing && <p className="text-sm text-muted">No document set generated yet.</p>}

      <div className="mt-4">
        <AdvisoryDisclaimer kind="docs" />
      </div>
    </section>
  );
}
