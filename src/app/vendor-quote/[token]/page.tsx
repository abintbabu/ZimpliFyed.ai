import { notFound } from 'next/navigation';
import { getVendorPortalRfq } from '@/actions/vendor-portal';
import { VendorQuoteForm } from './quote-form';

export const metadata = { title: 'Request for quotation', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function VendorQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getVendorPortalRfq(token);
  if (!data) notFound();
  const { rfq } = data;

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Request for quotation · {data.buyerName}</p>
        <h1 className="text-2xl font-semibold text-ink">{rfq.title}</h1>
        <p className="text-sm text-muted">{rfq.rfqNumber} · for {data.vendorName}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-white p-4 text-sm">
        {rfq.quantity != null && <div><dt className="text-xs text-muted">Quantity</dt><dd className="text-ink">{rfq.quantity} {rfq.unit ?? ''}</dd></div>}
        {rfq.dueDate && <div><dt className="text-xs text-muted">Reply by</dt><dd className="text-ink">{rfq.dueDate.toISOString().slice(0, 10)}</dd></div>}
        {rfq.description && <div className="col-span-2"><dt className="text-xs text-muted">Details</dt><dd className="whitespace-pre-line text-ink">{rfq.description}</dd></div>}
      </dl>
      {data.usable.ok ? <VendorQuoteForm token={token} existing={data.existing} /> : <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{data.usable.reason}</p>}
    </div>
  );
}
