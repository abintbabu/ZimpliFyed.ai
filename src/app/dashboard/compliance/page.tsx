import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listComplianceItems } from '@/actions/compliance';
import { ComplianceList } from './compliance-list';
import { NewComplianceItemForm } from './new-compliance-item-form';

export default async function CompliancePage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'compliance:read')) redirect('/dashboard');

  const items = await listComplianceItems(tenantId);
  const canWrite = hasPermission(role, 'compliance:write');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Compliance vault</h1>
          <p className="text-sm text-muted">IEC, AD code, GST/LUT, RCMC, buyer certs — with renewal deadlines.</p>
        </div>
        {canWrite && <NewComplianceItemForm />}
      </div>

      <ComplianceList items={items} canWrite={canWrite} />
    </div>
  );
}
