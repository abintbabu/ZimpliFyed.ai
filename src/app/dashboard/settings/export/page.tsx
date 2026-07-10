import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { ExportRequestPanel } from './export-request-panel';

export const metadata = { title: 'Export data' };

export default async function DataExportPage() {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'users:manage')) {
    return <p className="text-sm text-muted">Only owners and admins can export workspace data.</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Export data</h1>
        <p className="mt-1 text-sm text-muted">
          Download every module as CSV plus a full JSON dump. Your data is always yours — no lock-in.
        </p>
      </div>
      <ExportRequestPanel />
    </div>
  );
}
