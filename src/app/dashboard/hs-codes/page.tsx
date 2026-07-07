import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listHsCodes } from '@/actions/hs-codes';
import { HsCodeLookup } from './hs-code-lookup';

export default async function HsCodesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'quotes:write')) redirect('/dashboard');

  const history = await listHsCodes(tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">HS Code Assistant</h1>
        <p className="text-sm text-muted">
          AI-estimated classification, duty rate, and RoDTEP rate. Always verify with your CHA before filing.
        </p>
      </div>
      <HsCodeLookup initialHistory={history} />
    </div>
  );
}
