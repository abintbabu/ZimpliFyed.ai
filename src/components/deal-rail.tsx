import Link from 'next/link';
import type { Quote, Order, Invoice } from '@prisma/client';

type Stage = 'lead' | 'quote' | 'order' | 'invoice';

const STAGES: Stage[] = ['lead', 'quote', 'order', 'invoice'];
const STAGE_LABELS: Record<Stage, string> = { lead: 'Lead', quote: 'Quote', order: 'Order', invoice: 'Invoice' };

/**
 * Lead -> Quote -> Order -> Invoice timeline. Ported from anabyn-website's Firestore-backed
 * deal-rail; here the caller resolves the relevant records server-side and passes them in,
 * since there's no realtime-listener equivalent yet.
 */
export function DealRail({
  current,
  quote,
  order,
  invoice,
}: {
  current: Stage;
  quote?: Quote | null;
  order?: Order | null;
  invoice?: Invoice | null;
}) {
  const currentIndex = STAGES.indexOf(current);

  const marginWarning = quote?.overallMarginPct != null && quote.overallMarginPct < 10;

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-white p-4 text-sm">
      {STAGES.map((stage, i) => {
        const active = i <= currentIndex;
        const href =
          stage === 'quote' && quote ? `/dashboard/quotes/${quote.id}`
          : stage === 'order' && order ? `/dashboard/orders/${order.id}`
          : stage === 'invoice' && invoice ? `/dashboard/invoices/${invoice.id}`
          : null;
        const label = STAGE_LABELS[stage];
        const content = (
          <span className={active ? 'font-medium text-ink' : 'text-muted'}>
            {label}
            {stage === 'quote' && marginWarning && <span className="ml-1 text-amber-600">⚠ low margin</span>}
          </span>
        );
        return (
          <div key={stage} className="flex items-center gap-2">
            {href ? <Link href={href} className="hover:underline">{content}</Link> : content}
            {i < STAGES.length - 1 && <span className="text-line">→</span>}
          </div>
        );
      })}
    </div>
  );
}
