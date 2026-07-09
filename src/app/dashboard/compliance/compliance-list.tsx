'use client';

import { useTransition } from 'react';
import { ShieldCheck } from 'lucide-react';
import { deleteComplianceItem } from '@/actions/compliance';
import { complianceStatus, COMPLIANCE_CATEGORY_LABELS, type ComplianceStatus } from '@/lib/compliance-deadlines';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import type { ComplianceItem } from '@prisma/client';

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  expired: 'Expired',
  expiring_soon: 'Expiring soon',
  ok: 'Valid',
  no_expiry: 'No expiry',
};

export function ComplianceList({ items, canWrite }: { items: ComplianceItem[]; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();

  const columns: DataTableColumn<ComplianceItem>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (item) => (
        <>
          <p className="font-medium text-ink">{item.name}</p>
          {item.issuingAuthority && <p className="text-xs text-muted">{item.issuingAuthority}</p>}
        </>
      ),
    },
    { key: 'category', header: 'Category', render: (item) => COMPLIANCE_CATEGORY_LABELS[item.category] },
    { key: 'documentNumber', header: 'Document #', render: (item) => item.documentNumber ?? '—' },
    {
      key: 'expiresAt',
      header: 'Expires',
      render: (item) => (item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        const status = complianceStatus(item.expiresAt, item.renewalLeadDays);
        return (
          <Badge tone={statusTone(status)} dot>
            {STATUS_LABELS[status]}
          </Badge>
        );
      },
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (item: ComplianceItem) => (
              <button
                disabled={pending}
                onClick={() => startTransition(() => deleteComplianceItem(item.id))}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      empty={<EmptyState icon={ShieldCheck} title="No compliance items tracked yet" description="Add licenses, certificates, and registrations to track their renewal dates." />}
    />
  );
}
