import { notFound } from 'next/navigation';
import { getQuoteByShareToken } from '@/actions/quotes';
import { RespondForm } from './respond-form';

export default async function SharedQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await getQuoteByShareToken(token);
  if (!quote) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Quote</p>
        <h1 className="text-2xl font-semibold text-ink">{quote.quoteNumber}</h1>
        {quote.buyerName && <p className="text-sm text-muted">{quote.buyerName}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-3 text-ink">{l.description}</td>
                <td className="px-4 py-3 text-muted">{l.quantity}</td>
                <td className="px-4 py-3 text-muted">{quote.currency} {l.unitPrice.toFixed(2)}</td>
                <td className="px-4 py-3 text-muted">{quote.currency} {l.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-medium">
              <td className="px-4 py-3 text-ink" colSpan={3}>Total</td>
              <td className="px-4 py-3 text-ink">{quote.currency} {quote.total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <RespondForm token={token} status={quote.status} />
    </div>
  );
}
