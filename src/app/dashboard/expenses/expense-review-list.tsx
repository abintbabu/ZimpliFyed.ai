'use client';

import { useTransition } from 'react';
import { ScanLine } from 'lucide-react';
import { approveExpenseAction, rejectExpenseAction, type ExpenseRow } from '@/actions/expenses';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, type BadgeTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import { useRouter } from 'next/navigation';

const STATUS: Record<ExpenseRow['status'], { label: string; tone: BadgeTone }> = {
  pending_review: { label: 'Needs review', tone: 'warning' },
  auto_posted: { label: 'Auto-posted', tone: 'success' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export function ExpenseReviewList({
  expenses,
  orders,
  canWrite,
}: {
  expenses: ExpenseRow[];
  orders: { id: string; orderNumber: string }[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  void orders; // reserved for inline order re-attribution in a later pass

  const act = (fn: () => Promise<void>) => startTransition(async () => { await fn(); router.refresh(); });

  const columns: DataTableColumn<ExpenseRow>[] = [
    {
      key: 'vendor',
      header: 'Vendor',
      render: (e) =>
        e.vendorName ? (
          <span className="font-medium text-ink">{e.vendorName}</span>
        ) : (
          <span className="text-muted">{e.status === 'pending_review' ? 'Reading…' : '—'}</span>
        ),
    },
    { key: 'gstHead', header: 'GST head', render: (e) => e.gstHead ?? <span className="text-muted">—</span> },
    {
      key: 'itc',
      header: 'ITC',
      render: (e) => (e.itcEligible == null ? <span className="text-muted">—</span> : e.itcEligible ? 'Eligible' : 'No'),
    },
    { key: 'order', header: 'Order', render: (e) => e.order?.orderNumber ?? <span className="text-muted">Unattributed</span> },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (e) => (e.amount == null ? <span className="text-muted">—</span> : <span className="text-ink">{e.currency ?? ''} {e.amount.toFixed(2)}</span>),
    },
    {
      key: 'confidence',
      header: 'Confidence',
      numeric: true,
      render: (e) => (e.confidence == null ? <span className="text-muted">—</span> : `${Math.round(e.confidence * 100)}%`),
    },
    { key: 'status', header: 'Status', render: (e) => <Badge tone={STATUS[e.status].tone} dot>{STATUS[e.status].label}</Badge> },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (e: ExpenseRow) =>
              e.status === 'pending_review' && e.amount != null ? (
                <div className="flex items-center justify-end gap-3">
                  <button
                    disabled={pending}
                    onClick={() => act(() => approveExpenseAction(e.id))}
                    className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => act(() => rejectExpenseAction(e.id))}
                    className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      rows={expenses}
      rowKey={(e) => e.id}
      empty={<EmptyState icon={ScanLine} title="No expenses yet" description="Snap a receipt or UPI screenshot and the AI books it — high-confidence reads post automatically, the rest wait here for a tap." />}
    />
  );
}
