import { ShieldAlert } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import type { ScreeningCheck } from '@prisma/client';

const RESULT_LABELS: Record<string, string> = {
  clear: 'Clear',
  potential_match: 'Potential match',
  manual_attestation: 'Manual attestation',
};

export function ScreeningHistory({ checks }: { checks: ScreeningCheck[] }) {
  const columns: DataTableColumn<ScreeningCheck>[] = [
    { key: 'subjectName', header: 'Subject', render: (c) => <span className="font-medium text-ink">{c.subjectName}</span> },
    { key: 'country', header: 'Country', render: (c) => c.country ?? '—' },
    {
      key: 'result',
      header: 'Result',
      render: (c) => (
        <Badge tone={statusTone(c.result)} dot>
          {RESULT_LABELS[c.result] ?? c.result}
        </Badge>
      ),
    },
    { key: 'source', header: 'Source', render: (c) => c.source },
    { key: 'checkedAt', header: 'Checked', render: (c) => new Date(c.checkedAt).toLocaleString() },
  ];

  return (
    <DataTable
      columns={columns}
      rows={checks}
      rowKey={(c) => c.id}
      empty={<EmptyState icon={ShieldAlert} title="No screening checks recorded yet" description="Sanctions and denied-party screening results will appear here." />}
    />
  );
}
