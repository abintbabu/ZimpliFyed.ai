'use client';

import { useState, useTransition } from 'react';
import { generateExportDocument, runDocumentConsistencyCheck } from '@/actions/export-documents';
import { EXPORT_DOCUMENT_LABELS, type ExportDocumentData } from '@/lib/export-documents';
import { usePlanGate } from '@/lib/billing/use-plan-gate';
import { UpsellSheet } from '@/components/upsell-sheet';
import { AdvisoryDisclaimer } from '@/components/advisory-disclaimer';
import type { ExportDocumentType } from '@prisma/client';

const DOC_TYPES = Object.keys(EXPORT_DOCUMENT_LABELS) as ExportDocumentType[];

type Doc = {
  id: string;
  type: ExportDocumentType;
  version: number;
  data: ExportDocumentData;
  createdAt: Date;
};

type ConsistencyResult = { consistent: boolean; issues: { description: string; severity: 'low' | 'medium' | 'high' }[] };

export function ExportDocumentsPanel({
  orderId,
  initialDocs,
  canWrite,
}: {
  orderId: string;
  initialDocs: Doc[];
  canWrite: boolean;
}) {
  const [docs, setDocs] = useState(initialDocs);
  const [buyerName, setBuyerName] = useState(initialDocs[0]?.data.buyerName ?? '');
  const [buyerAddress, setBuyerAddress] = useState(initialDocs[0]?.data.buyerAddress ?? '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<ConsistencyResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [checking, startChecking] = useTransition();
  const { gate, tryOpenFromError, close } = usePlanGate();

  function handleGenerate(type: ExportDocumentType) {
    setError(null);
    startTransition(async () => {
      try {
        const doc = await generateExportDocument({ orderId, type, buyerName, buyerAddress });
        setDocs((prev) => [{ ...doc, data: doc.data as unknown as ExportDocumentData }, ...prev]);
      } catch (err) {
        if (!tryOpenFromError(err)) setError(err instanceof Error ? err.message : 'Failed to generate document');
      }
    });
  }

  function handleCheck() {
    setError(null);
    setCheckResult(null);
    startChecking(async () => {
      try {
        const result = await runDocumentConsistencyCheck(orderId);
        setCheckResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Consistency check failed');
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      {gate && <UpsellSheet feature={gate} onClose={close} />}
      <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Export documents</h2>

      {canWrite && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Buyer name"
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
          <input
            value={buyerAddress}
            onChange={(e) => setBuyerAddress(e.target.value)}
            placeholder="Buyer address"
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
        </div>
      )}

      {canWrite && (
        <div className="mb-4 flex flex-wrap gap-2">
          {DOC_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => handleGenerate(type)}
              disabled={pending}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
            >
              Generate {EXPORT_DOCUMENT_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {docs.length === 0 ? (
        <p className="text-sm text-muted">No documents generated yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="py-2">
              <button
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                className="flex w-full items-center justify-between text-left text-sm"
              >
                <span className="text-ink">{EXPORT_DOCUMENT_LABELS[d.type]} <span className="text-muted">v{d.version}</span></span>
                <span className="text-xs text-muted">{new Date(d.createdAt).toLocaleDateString()}</span>
              </button>
              {expanded === d.id && (
                <div className="mt-2 rounded-lg bg-surface p-3 text-xs text-ink">
                  <p><strong>Buyer:</strong> {d.data.buyerName} — {d.data.buyerAddress}</p>
                  <p><strong>Incoterm:</strong> {d.data.incoterm ?? '—'} · <strong>Route:</strong> {d.data.originPort ?? '—'} → {d.data.destPort ?? d.data.destination ?? '—'}</p>
                  <table className="mt-2 w-full">
                    <thead className="text-left text-muted">
                      <tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                      {d.data.lines.map((l, i) => (
                        <tr key={i}>
                          <td>{l.description}</td>
                          <td>{l.quantity}</td>
                          <td>{l.unitPrice}</td>
                          <td>{l.lineTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-right font-medium">Total: {d.data.currency} {d.data.total}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {docs.length >= 2 && (
        <div>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Check consistency across documents'}
          </button>

          {checkResult && (
            <div className="mt-3 rounded-lg border border-line p-3 text-sm">
              {checkResult.consistent ? (
                <p className="text-green-700">No discrepancies found across documents.</p>
              ) : (
                <ul className="space-y-2">
                  {checkResult.issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${
                        issue.severity === 'high' ? 'bg-red-100 text-red-700' :
                        issue.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-surface text-muted'
                      }`}>
                        {issue.severity}
                      </span>
                      <span className="text-ink">{issue.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <AdvisoryDisclaimer kind="docs" />
      </div>
    </section>
  );
}
