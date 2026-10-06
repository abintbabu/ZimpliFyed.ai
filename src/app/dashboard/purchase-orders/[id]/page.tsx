import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { getPurchaseOrder } from '@/actions/purchase-orders';
import { listGoodsReceipts } from '@/actions/goods-receipts';
import { poReceiptProgress } from '@/lib/goods-receipt';
import { PoReceivePanel } from '../po-receive-panel';
import { isPoEditable } from '@/lib/purchase-order';
import { amountInWords } from '@/lib/doc-engine/num-to-words';
import { PoEditor } from '../po-editor';
import { PoStatusActions } from '../po-status-actions';
import { PrintButton } from '../print-button';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return <p className="text-sm text-muted">You do not have access to purchase orders.</p>;

  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { legalName: true, registeredAddress: true, gstin: true, name: true } });
  const receipts = await listGoodsReceipts(po.id);
  const progress = poReceiptProgress(po.lines, receipts.map((r) => r.lines));
  const canReceive = ['issued', 'acknowledged'].includes(po.status);
  const canWrite = hasPermission(role, 'vendors:write');
  const editable = isPoEditable(po.status);
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href="/dashboard/purchase-orders" className="text-xs text-brand hover:underline">← Purchase orders</Link>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{po.poNumber} <span className="text-sm font-normal capitalize text-muted">{po.status}</span></h1>
        </div>
        <div className="flex items-center gap-2"><PrintButton />{canWrite && <PoStatusActions poId={po.id} status={po.status} />}</div>
      </div>

      {editable && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          Draft — review quantities, prices and terms before issuing. {po.notes?.includes('not specified') ? 'The RFQ had no quantity, so one was assumed.' : ''}
        </p>
      )}

      <article className="rounded-2xl border border-line bg-white p-8 text-sm text-ink print:border-0 print:p-0">
        <header className="flex items-start justify-between border-b-2 border-ink pb-4">
          <div>
            <p className="text-base font-semibold">{tenant?.legalName ?? tenant?.name}</p>
            {tenant?.registeredAddress && <p className="mt-1 max-w-xs whitespace-pre-line text-muted">{tenant.registeredAddress}</p>}
            {tenant?.gstin && <p className="mt-1 text-muted">GSTIN {tenant.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">Purchase Order</p>
            <p className="mt-1 font-mono text-muted">{po.poNumber}</p>
            <p className="text-muted">{po.createdAt.toISOString().slice(0, 10)}</p>
          </div>
        </header>

        <section className="my-5 grid gap-6 sm:grid-cols-2">
          <div><p className="text-xs uppercase tracking-wide text-muted">Vendor</p><p className="mt-1 font-semibold">{po.vendor.name}</p>{po.vendor.contactName && <p className="text-muted">Attn: {po.vendor.contactName}</p>}{po.vendor.email && <p className="text-muted">{po.vendor.email}</p>}{po.vendor.phone && <p className="text-muted">{po.vendor.phone}</p>}</div>
          <dl className="space-y-1">
            <div className="flex gap-2"><dt className="w-28 text-muted">Currency</dt><dd>{po.currency}</dd></div>
            {po.incoterm && <div className="flex gap-2"><dt className="w-28 text-muted">Incoterm</dt><dd>{po.incoterm}</dd></div>}
            {po.paymentTerms && <div className="flex gap-2"><dt className="w-28 text-muted">Payment terms</dt><dd>{po.paymentTerms}</dd></div>}
            {po.deliveryDate && <div className="flex gap-2"><dt className="w-28 text-muted">Deliver by</dt><dd>{po.deliveryDate.toISOString().slice(0, 10)}</dd></div>}
          </dl>
        </section>

        <table className="w-full text-left">
          <thead className="bg-surface text-xs uppercase tracking-wide text-muted"><tr><th className="p-2">#</th><th className="p-2">Description</th><th className="p-2">SKU</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit price</th><th className="p-2 text-right">Amount</th></tr></thead>
          <tbody>
            {po.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-line">
                <td className="p-2">{i + 1}</td><td className="p-2">{l.description}</td><td className="p-2 font-mono text-xs">{l.sku ?? ''}</td>
                <td className="p-2 text-right tabular-nums">{l.quantity.toLocaleString('en-US')} {l.uom ?? ''}</td>
                <td className="p-2 text-right tabular-nums">{fmt(l.unitPrice)}</td><td className="p-2 text-right tabular-nums">{fmt(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5} className="p-2 text-right font-semibold">Total ({po.currency})</td><td className="p-2 text-right text-base font-bold tabular-nums">{fmt(po.total)}</td></tr></tfoot>
        </table>
        <p className="mt-2 text-xs text-muted">{po.currency} {amountInWords(po.total, po.currency)}</p>
        {po.notes && <p className="mt-5 whitespace-pre-line border-t border-line pt-3 text-muted">{po.notes}</p>}
      </article>

      {canWrite && editable && <PoEditor poId={po.id} initial={po} />}

      {canWrite && canReceive && (
        <PoReceivePanel poId={po.id} lines={po.lines.map((l) => { const p = progress.lines.find((x) => x.poLineId === l.id)!; return { id: l.id, description: l.description, sku: l.sku, ordered: l.quantity, received: p.received, remaining: p.remaining, uom: l.uom }; })} />
      )}

      {receipts.length > 0 && (
        <section className="rounded-2xl border border-line bg-white p-4 print:hidden">
          <h2 className="mb-2 text-sm font-semibold text-ink">Receipts</h2>
          <ul className="divide-y divide-line text-sm">
            {receipts.map((r) => (
              <li key={r.id} className="py-2"><span className="font-mono text-xs text-muted">{r.receiptNumber}</span> <span className="text-ink">{r.receivedAt.toISOString().slice(0, 10)}</span>
                <span className="ml-2 text-muted">{r.lines.map((l) => `${l.description}: ${l.qtyReceived}${l.qtyRejected ? ` (${l.qtyRejected} rejected${l.rejectReason ? `: ${l.rejectReason}` : ''})` : ''}`).join(' · ')}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
