import { notFound } from 'next/navigation';
import { getBuyerTrackByToken } from '@/actions/order-track';

export default async function BuyerTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getBuyerTrackByToken(token);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Order</p>
        <h1 className="text-2xl font-semibold text-ink">{data.orderNumber}</h1>
      </div>

      <div className="rounded-2xl border border-line bg-white p-4 text-sm">
        <div className="mb-3 inline-block rounded-full bg-brand/10 px-3 py-1 text-xs font-medium capitalize text-brand">
          {data.status.replace('_', ' ')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-xs text-muted">Product</p><p className="text-ink">{data.product ?? '—'}</p></div>
          <div><p className="text-xs text-muted">Quantity</p><p className="text-ink">{data.quantity ?? '—'} {data.unit ?? ''}</p></div>
          <div><p className="text-xs text-muted">Incoterm</p><p className="text-ink">{data.incoterm ?? '—'}</p></div>
          <div><p className="text-xs text-muted">Destination</p><p className="text-ink">{data.destination ?? '—'}</p></div>
          <div><p className="text-xs text-muted">Origin port</p><p className="text-ink">{data.originPort ?? '—'}</p></div>
          <div><p className="text-xs text-muted">Destination port</p><p className="text-ink">{data.destPort ?? '—'}</p></div>
        </div>
      </div>
    </div>
  );
}
