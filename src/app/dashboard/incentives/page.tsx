import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listIncentiveClaims } from '@/actions/incentive-claims';
import { listOrders } from '@/actions/orders';
import { IncentiveClaimsList } from './incentive-claims-list';
import { NewIncentiveClaimForm } from './new-incentive-claim-form';

export default async function IncentivesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'invoices:read')) redirect('/dashboard');

  const [claims, orders] = await Promise.all([listIncentiveClaims(tenantId), listOrders(tenantId)]);
  const canWrite = hasPermission(role, 'invoices:write');

  const claimableTotal = claims.filter((c) => c.status === 'claimable').reduce((sum, c) => sum + c.amount, 0);
  const claimedTotal = claims.filter((c) => c.status === 'claimed').reduce((sum, c) => sum + c.amount, 0);
  const receivedTotal = claims.filter((c) => c.status === 'received').reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Export incentives</h1>
          <p className="text-sm text-muted">RoDTEP, duty drawback, and EPCG obligations — what&apos;s claimable, claimed, and received.</p>
        </div>
        {canWrite && <NewIncentiveClaimForm orders={orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber }))} />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-xs text-muted">Claimable (money on the table)</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{claimableTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-xs text-muted">Claimed, awaiting payment</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{claimedTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-xs text-muted">Received</p>
          <p className="mt-1 text-2xl font-semibold text-green-700">{receivedTotal.toFixed(2)}</p>
        </div>
      </div>

      <IncentiveClaimsList claims={claims} canWrite={canWrite} />
    </div>
  );
}
