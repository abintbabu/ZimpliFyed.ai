import { EntityDocuments } from '@/components/entity-documents';
import { getVendorScorecard } from '@/actions/goods-receipts';
import { VendorScorecard } from '@/components/vendor-scorecard';
import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getVendor } from '@/actions/vendors';
import { VendorRatesPanel } from './vendor-rates-panel';

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) {
    return <p className="text-sm text-muted">You do not have access to vendors.</p>;
  }

  const vendor = await getVendor(id);
  if (!vendor) notFound();
  const scorecard = await getVendorScorecard(id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{vendor.name}</h1>
        <p className="text-sm text-muted">{vendor.contactName} {vendor.email ? `· ${vendor.email}` : ''} {vendor.phone ? `· ${vendor.phone}` : ''}</p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Rates</h2>
        <VendorRatesPanel vendorId={vendor.id} rates={vendor.rates} />
      </div>

      {scorecard && <VendorScorecard card={scorecard} />}

      <EntityDocuments collection="vendors" documentId={id} canWrite={hasPermission(role, 'vendors:write')} />
    </div>
  );
}
