import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getBuyer, listBuyerActivity } from '@/actions/buyers';
import { NewContactForm } from './new-contact-form';
import { ActivityPanel } from './activity-panel';

export default async function BuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'customers:read')) {
    return <p className="text-sm text-muted">You do not have access to buyers.</p>;
  }

  const [buyer, activities] = await Promise.all([getBuyer(tenantId, id), listBuyerActivity(tenantId, id)]);
  if (!buyer) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{buyer.name}</h1>
        <p className="text-sm text-muted">
          {buyer.country ?? '—'} · {buyer.currencyDefault} · {buyer.paymentTermsDefault ?? 'no default terms'}
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Contacts</h2>
          <NewContactForm buyerId={buyer.id} />
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {buyer.contacts.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-white p-3">
              <p className="text-sm font-medium text-ink">{c.name} {c.isPrimary && <span className="text-xs text-brand">· primary</span>}</p>
              <p className="text-xs text-muted">{c.role ?? '—'}</p>
              <p className="text-xs text-muted">{c.email ?? '—'} {c.phone ? `· ${c.phone}` : ''}</p>
            </li>
          ))}
          {buyer.contacts.length === 0 && <p className="text-sm text-muted">No contacts yet.</p>}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Quotes</h2>
          <ul className="space-y-2">
            {buyer.quotes.map((q) => (
              <li key={q.id} className="rounded-xl border border-line bg-white p-3 text-sm">
                <Link href={`/dashboard/quotes/${q.id}`} className="font-medium text-ink hover:underline">
                  {q.quoteNumber}
                </Link>
                <span className="ml-2 text-muted">{q.status} · {q.currency} {q.total.toFixed(2)}</span>
              </li>
            ))}
            {buyer.quotes.length === 0 && <p className="text-sm text-muted">No quotes yet.</p>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Orders</h2>
          <ul className="space-y-2">
            {buyer.orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-line bg-white p-3 text-sm">
                <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-ink hover:underline">
                  {o.orderNumber}
                </Link>
                <span className="ml-2 text-muted">{o.status}</span>
              </li>
            ))}
            {buyer.orders.length === 0 && <p className="text-sm text-muted">No orders yet.</p>}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Activity</h2>
        <ActivityPanel buyerId={buyer.id} activities={activities} />
      </section>
    </div>
  );
}
