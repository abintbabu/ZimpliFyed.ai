import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getQuote } from '@/actions/quotes';
import { getCostSheet } from '@/actions/cost-sheets';
import { prisma } from '@/lib/prisma';
import { DealRail } from '@/components/deal-rail';
import { CostSheetPanel } from '@/components/cost-sheet-panel';
import { QuoteLineItemsPanel } from '@/components/quote-line-items-panel';
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

      <QuoteLineItemsPanel
        quoteId={quote.id}
        currency={quote.currency}
        canWrite={hasPermission(role, 'quotes:write')}
        initial={quote.lines}
      />

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
