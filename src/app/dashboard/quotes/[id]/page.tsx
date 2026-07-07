import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getQuote } from '@/actions/quotes';
import { getCostSheet } from '@/actions/cost-sheets';
import { prisma } from '@/lib/prisma';
import { DealRail } from '@/components/deal-rail';
import { CostSheetPanel } from '@/components/cost-sheet-panel';
import { QuoteActions } from './quote-actions';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'quotes:read')) {
    return <p className="text-sm text-muted">You do not have access to quotes.</p>;
  }

  const quote = await getQuote(tenantId, id);
  if (!quote) notFound();

  const order = quote.orderId ? await prisma.order.findFirst({ where: { id: quote.orderId, tenantId } }) : null;
  const invoice = order ? await prisma.invoice.findFirst({ where: { orderId: order.id, tenantId } }) : null;
  const costSheet = await getCostSheet(tenantId, quote.id);
  const avgUnitPrice = quote.lines.length
    ? quote.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) / quote.lines.reduce((sum, l) => sum + l.quantity, 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{quote.quoteNumber}</h1>
          <p className="text-sm text-muted capitalize">{quote.status}</p>
        </div>
        <QuoteActions quoteId={quote.id} status={quote.status} canWrite={hasPermission(role, 'quotes:write')} />
      </div>

      <DealRail current="quote" quote={quote} order={order} invoice={invoice} />

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3">Exp %</th>
              <th className="px-4 py-3">Margin %</th>
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Line total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-4 py-3 text-ink">{l.description}</td>
                <td className="px-4 py-3 text-muted">{l.quantity}</td>
                <td className="px-4 py-3 text-muted">{l.cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-muted">{l.expensePct}%</td>
                <td className="px-4 py-3 text-muted">{l.marginPct}%</td>
                <td className="px-4 py-3 text-muted">{l.unitPrice.toFixed(2)}</td>
                <td className="px-4 py-3 text-muted">{l.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-3 text-right text-sm font-medium text-ink">
          Total: {quote.currency} {quote.total.toFixed(2)}
        </div>
      </div>

      <CostSheetPanel
        quoteId={quote.id}
        canWrite={hasPermission(role, 'quotes:write')}
        initial={
          costSheet
            ? {
                incoterm: costSheet.incoterm,
                sellPricePerUnit: costSheet.sellPricePerUnit,
                rodtepPct: costSheet.rodtepPct,
                lines: costSheet.lines,
              }
            : { incoterm: 'FOB', sellPricePerUnit: avgUnitPrice, rodtepPct: 0, lines: [] }
        }
      />
    </div>
  );
}
