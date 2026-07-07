'use client';

import { useTransition } from 'react';
import { deleteComplianceItem } from '@/actions/compliance';
import { complianceStatus, COMPLIANCE_CATEGORY_LABELS, type ComplianceStatus } from '@/lib/compliance-deadlines';
import type { ComplianceItem } from '@prisma/client';

const STATUS_STYLES: Record<ComplianceStatus, string> = {
  expired: 'bg-red-100 text-red-700',
  expiring_soon: 'bg-amber-100 text-amber-700',
  ok: 'bg-green-100 text-green-700',
  no_expiry: 'bg-surface text-muted',
};

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  expired: 'Expired',
  expiring_soon: 'Expiring soon',
  ok: 'Valid',
  no_expiry: 'No expiry',
};

export function ComplianceList({ items, canWrite }: { items: ComplianceItem[]; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Document #</th>
            <th className="px-4 py-3">Expires</th>
            <th className="px-4 py-3">Status</th>
            {canWrite && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const status = complianceStatus(item.expiresAt, item.renewalLeadDays);
            return (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{item.name}</p>
                  {item.issuingAuthority && <p className="text-xs text-muted">{item.issuingAuthority}</p>}
                </td>
                <td className="px-4 py-3 text-muted">{COMPLIANCE_CATEGORY_LABELS[item.category]}</td>
                <td className="px-4 py-3 text-muted">{item.documentNumber ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
                    {STATUS_LABELS[status]}
                  </span>
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={pending}
                      onClick={() => startTransition(() => deleteComplianceItem(item.id))}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={canWrite ? 6 : 5} className="px-4 py-8 text-center text-muted">No compliance items tracked yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
