'use client';

import { useTransition } from 'react';
import { updateIncentiveClaimStatus } from '@/actions/incentive-claims';
import type { IncentiveClaimStatus, IncentiveType } from '@prisma/client';

const TYPE_LABELS: Record<IncentiveType, string> = {
  rodtep: 'RoDTEP',
  drawback: 'Duty drawback',
  epcg_obligation: 'EPCG obligation',
};

const STATUS_STYLES: Record<IncentiveClaimStatus, string> = {
  claimable: 'bg-amber-100 text-amber-700',
  claimed: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
};

const NEXT_STATUS: Partial<Record<IncentiveClaimStatus, IncentiveClaimStatus>> = {
  claimable: 'claimed',
  claimed: 'received',
};

type Claim = {
  id: string;
  type: IncentiveType;
  status: IncentiveClaimStatus;
  amount: number;
  currency: string;
  order: { orderNumber: string };
  createdAt: Date;
};

export function IncentiveClaimsList({ claims, canWrite }: { claims: Claim[]; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Status</th>
            {canWrite && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => {
            const next = NEXT_STATUS[c.status];
            return (
              <tr key={c.id} className="border-t border-line">
                <td className="px-4 py-3 text-ink">{c.order.orderNumber}</td>
                <td className="px-4 py-3 text-muted">{TYPE_LABELS[c.type]}</td>
                <td className="px-4 py-3 text-ink">{c.currency} {c.amount.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    {next && (
                      <button
                        disabled={pending}
                        onClick={() => startTransition(async () => { await updateIncentiveClaimStatus(c.id, next); })}
                        className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
                      >
                        Mark {next}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {claims.length === 0 && (
            <tr><td colSpan={canWrite ? 5 : 4} className="px-4 py-8 text-center text-muted">No incentive claims tracked yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
