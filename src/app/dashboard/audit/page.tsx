import { redirect } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission, ROLE_LABELS } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { EmptyState } from '@/components/dashboard/empty-state';

export default async function AuditPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'users:manage')) redirect('/dashboard');

  const entries = await prisma.auditEntry.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  type Entry = (typeof entries)[number];

  const columns: DataTableColumn<Entry>[] = [
    { key: 'createdAt', header: 'When', className: 'whitespace-nowrap', render: (e) => e.createdAt.toLocaleString() },
    {
      key: 'actor',
      header: 'Actor',
      render: (e) => (
        <>
          <span className="text-ink">{e.actorEmail}</span>
          {e.actorRole && <span className="ml-1 text-xs text-muted">({ROLE_LABELS[e.actorRole]})</span>}
        </>
      ),
    },
    { key: 'action', header: 'Action', render: (e) => e.action },
    { key: 'summary', header: 'Summary', render: (e) => <span className="text-ink">{e.summary}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" />

      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(e) => e.id}
        empty={<EmptyState icon={ScrollText} title="No activity recorded yet" description="Actions taken across the workspace will appear here." />}
      />
    </div>
  );
}
