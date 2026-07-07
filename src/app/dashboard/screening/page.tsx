import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listScreeningChecks } from '@/actions/screening';
import { ScreeningForm } from './screening-form';
import { ScreeningHistory } from './screening-history';

export default async function ScreeningPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'compliance:read')) redirect('/dashboard');

  const checks = await listScreeningChecks(tenantId);
  const canWrite = hasPermission(role, 'compliance:write');
  const apiConfigured = Boolean(process.env.CSL_API_KEY);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Denied-party screening</h1>
        <p className="text-sm text-muted">
          {apiConfigured
            ? 'Screens against the U.S. Consolidated Screening List (OFAC, BIS Entity List, and others) before shipment.'
            : 'No screening API configured — record the result of a manual check against public sanctions lists (e.g. trade.gov CSL, OFAC SDN search).'}
        </p>
      </div>

      {canWrite && <ScreeningForm apiConfigured={apiConfigured} />}

      <ScreeningHistory checks={checks} />
    </div>
  );
}
