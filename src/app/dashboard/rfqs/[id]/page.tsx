import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getVendorRfq } from '@/actions/vendor-rfqs';
import { computeVendorQuoteLandedCost } from '@/lib/landed-cost';
import { RecordQuoteForm } from './record-quote-form';
import { QuoteComparisonTable } from './quote-comparison-table';
import { RfqStatusActions } from './rfq-status-actions';

export default async function VendorRfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) {
    return <p className="text-sm text-muted">You do not have access to RFQs.</p>;
  }

  const rfq = await getVendorRfq(tenantId, id);
  if (!rfq) notFound();

  const canWrite = hasPermission(role, 'vendors:write');
  const invitedVendors = rfq.invites.map((i) => i.vendor);
  const quotedVendorIds = new Set(rfq.quotes.map((q) => q.vendorId));
  const pendingVendors = invitedVendors.filter((v) => !quotedVendorIds.has(v.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{rfq.rfqNumber} — {rfq.title}</h1>
          <p className="text-sm text-muted capitalize">{rfq.status}{rfq.quantity ? ` · ${rfq.quantity} ${rfq.unit ?? ''}` : ''}{rfq.targetPrice ? ` · target ${rfq.targetPrice}` : ''}</p>
        </div>
        {canWrite && rfq.status === 'open' && <RfqStatusActions rfqId={rfq.id} hasQuotes={rfq.quotes.length > 0} />}
      </div>

      {rfq.description && <p className="rounded-2xl border border-line bg-white p-4 text-sm text-ink">{rfq.description}</p>}

      <QuoteComparisonTable
        rfqId={rfq.id}
        quotes={rfq.quotes.map((q) => ({
          id: q.id,
          vendorName: q.vendor.name,
          rate: q.rate,
          incoterm: q.incoterm,
          landedCostPerUnit: computeVendorQuoteLandedCost({
            quoteIncoterm: q.incoterm,
            comparisonIncoterm: 'DDP',
            rate: q.rate,
            addOns: [
              { category: 'inland_freight', amountPerUnit: q.inlandFreightPerUnit },
              { category: 'freight', amountPerUnit: q.freightPerUnit },
              { category: 'insurance', amountPerUnit: q.insurancePerUnit },
              { category: 'duties', amountPerUnit: q.dutiesPerUnit },
              { category: 'other', amountPerUnit: q.otherCostsPerUnit },
            ],
          }).landedCostPerUnit,
          moqPieces: q.moqPieces,
          leadTimeDays: q.leadTimeDays,
          notes: q.notes,
        }))}
        awardedQuoteId={rfq.awardedQuoteId}
        canWrite={canWrite && rfq.status === 'open'}
      />

      {canWrite && rfq.status === 'open' && pendingVendors.length > 0 && (
        <RecordQuoteForm rfqId={rfq.id} vendors={pendingVendors.map((v) => ({ id: v.id, name: v.name }))} />
      )}
    </div>
  );
}
