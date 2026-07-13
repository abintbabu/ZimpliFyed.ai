import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listIncentiveClaims } from '@/actions/incentive-claims';
import { listOrders } from '@/actions/orders';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { AdvisoryDisclaimer } from '@/components/advisory-disclaimer';
import { IncentiveClaimsList } from './incentive-claims-list';
import { NewIncentiveClaimForm } from './new-incentive-claim-form';

export default async function IncentivesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'incentives:read')) redirect('/dashboard');

  const [claims, orders] = await Promise.all([listIncentiveClaims(tenantId), listOrders(tenantId)]);
  const canWrite = hasPermission(role, 'incentives:write');

  const claimableTotal = claims.filter((c) => c.status === 'claimable').reduce((sum, c) => sum + c.amount, 0);
  const claimedTotal = claims.filter((c) => c.status === 'claimed').reduce((sum, c) => sum + c.amount, 0);
  const receivedTotal = claims.filter((c) => c.status === 'received').reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export incentives"
        description="RoDTEP, duty drawback, and EPCG obligations — what's claimable, claimed, and received."
        actions={canWrite && <NewIncentiveClaimForm orders={orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber }))} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Claimable (money on the table)" value={claimableTotal.toFixed(2)} tone="warning" />
        <StatCard label="Claimed, awaiting payment" value={claimedTotal.toFixed(2)} />
        <StatCard label="Received" value={receivedTotal.toFixed(2)} tone="success" />
      </div>

      <IncentiveClaimsList claims={claims} canWrite={canWrite} />

      <AdvisoryDisclaimer kind="gst" />
    </div>
  );
}
