'use client';

import { useTransition } from 'react';
import { HandCoins } from 'lucide-react';
import { updateIncentiveClaimStatus } from '@/actions/incentive-claims';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import type { IncentiveClaimStatus, IncentiveType } from '@prisma/client';

const TYPE_LABELS: Record<IncentiveType, string> = {
  rodtep: 'RoDTEP',
  drawback: 'Duty drawback',
  epcg_obligation: 'EPCG obligation',
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

  const columns: DataTableColumn<Claim>[] = [
    { key: 'order', header: 'Order', render: (c) => <span className="font-medium text-ink">{c.order.orderNumber}</span> },
    { key: 'type', header: 'Type', render: (c) => TYPE_LABELS[c.type] },
    { key: 'amount', header: 'Amount', numeric: true, render: (c) => <span className="text-ink">{c.currency} {c.amount.toFixed(2)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge tone={statusTone(c.status)} dot>
          {c.status}
        </Badge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (c: Claim) => {
              const next = NEXT_STATUS[c.status];
              return next ? (
                <button
                  disabled={pending}
                  onClick={() => startTransition(async () => { await updateIncentiveClaimStatus(c.id, next); })}
                  className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
                >
                  Mark {next}
                </button>
              ) : null;
            },
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      rows={claims}
      rowKey={(c) => c.id}
      empty={<EmptyState icon={HandCoins} title="No incentive claims tracked yet" description="Claims appear here once orders are eligible for RoDTEP, drawback, or EPCG." />}
    />
  );
}
