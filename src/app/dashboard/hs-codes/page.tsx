import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listHsCodes } from '@/actions/hs-codes';
import { PageHeader } from '@/components/dashboard/page-header';
import { HsCodeLookup } from './hs-code-lookup';

export default async function HsCodesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'hs_codes:read')) redirect('/dashboard');

  const history = await listHsCodes(tenantId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="HS Code Assistant"
        description="AI-estimated classification, duty rate, and RoDTEP rate. Always verify with your CHA before filing."
      />
      <HsCodeLookup initialHistory={history} />
    </div>
  );
}
