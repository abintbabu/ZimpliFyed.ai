import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { loadAnalytics, type AnalyticsData } from '@/lib/analytics-loader';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const fmt = (n: number, cur: string) => `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default async function AnalyticsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'analytics:read')) redirect('/dashboard');

  const a = await loadAnalytics(tenantId);
  const cur = a.reportingCurrency;
  const excluded = a.ageing.excludedCount + a.revenue.excludedCount + a.marginByBuyer.excludedCount + a.pipeline.excludedCount;

  const maxRevenue = Math.max(1, ...a.revenue.points.map((p) => Math.abs(p.revenue)));
  const totalRevenue = a.revenue.points.reduce((s, p) => s + p.revenue, 0);
  const maxAgeing = Math.max(1, ...a.ageing.buckets.map((b) => b.amount));
  const maxPipeline = Math.max(1, ...a.pipeline.stages.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-muted">Revenue, margin, receivables and shipment performance — all figures in {cur}. Demo data is excluded.</p>
      </div>

      {a.converted && (
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink">
          Multiple currencies are converted to {cur} at your saved rates. <Link href="/dashboard/settings/fx" className="text-brand hover:underline">Review rates</Link>
        </div>
      )}
      {a.unconvertedCurrencies.length > 0 && (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          No exchange rate for {a.unconvertedCurrencies.join(', ')} — {excluded > 0 ? `${excluded} record(s) are` : 'those records are'} <strong>left out</strong> of the figures below.{' '}
          <Link href="/dashboard/settings/fx" className="underline">Add a rate</Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Tile label="Revenue (12 months)" value={fmt(totalRevenue, cur)} />
        <Tile label="Open receivables" value={fmt(a.ageing.total, cur)} />
        <Tile label="Overdue 90+ days" value={fmt(a.ageing.buckets.find((b) => b.key === 'd90_plus')?.amount ?? 0, cur)} danger />
        <Tile label="Milestones on time" value={a.shipments.onTimePct == null ? '—' : `${a.shipments.onTimePct}%`} hint={a.shipments.onTimePct == null ? 'Nothing completed yet' : `${a.shipments.onTime} on time · ${a.shipments.late} late`} />
      </div>

      <Card title="Revenue by month" note="Invoiced revenue by invoice date; credit notes are netted, debit notes added. Drafts and voids excluded.">
        <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Monthly revenue bar chart">
          {a.revenue.points.map((p) => (
            <div key={p.month} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${p.month}: ${fmt(p.revenue, cur)}`}>
              <div className={`w-full rounded-t ${p.revenue < 0 ? 'bg-danger/60' : 'bg-brand/70'}`} style={{ height: `${(Math.abs(p.revenue) / maxRevenue) * 100}%`, minHeight: p.revenue !== 0 ? 2 : 0 }} />
              <span className="text-[10px] text-muted">{p.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Receivables ageing" note="Unpaid balance on sent / partially paid / overdue invoices, by days past due.">
          <Bars rows={a.ageing.buckets.map((b) => ({ label: b.label, value: b.amount, display: `${fmt(b.amount, cur)} · ${b.count}`, danger: b.key === 'd61_90' || b.key === 'd90_plus' }))} max={maxAgeing} />
        </Card>
        <Card title="Order pipeline" note="Orders by status.">
          <Bars rows={a.pipeline.stages.map((s) => ({ label: s.status.replace('_', ' '), value: s.count, display: `${s.count} · ${fmt(s.value, cur)}` }))} max={maxPipeline} />
        </Card>
      </div>

      <MarginCard title="Margin by buyer" report={a.marginByBuyer} cur={cur} />
      <div className="grid gap-6 lg:grid-cols-2">
        <MarginCard title="Margin by country" report={a.marginByCountry} cur={cur} compact />
        <MarginCard title="Margin by product" report={a.marginByProduct} cur={cur} compact />
      </div>

      <Card title="Profit &amp; loss (last 6 months)" note={a.pnl.notes.join(' ')}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">Month</th><th className="pb-1 pr-2 text-right">Revenue</th><th className="pb-1 pr-2 text-right">Expenses</th><th className="pb-1 pr-2 text-right">Supplier bills</th><th className="pb-1 text-right">Operating profit</th></tr></thead>
            <tbody>
              {a.pnl.months.map((m) => (
                <tr key={m.month} className="border-t border-line"><td className="py-1.5 pr-2 text-ink">{m.month}</td><td className="py-1.5 pr-2 text-right tabular-nums">{fmt(m.revenue, cur)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{fmt(m.expenses, cur)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{fmt(m.vendorBills, cur)}</td><td className={`py-1.5 text-right tabular-nums ${m.operatingProfit < 0 ? 'text-danger' : 'text-ink'}`}>{fmt(m.operatingProfit, cur)}</td></tr>
              ))}
              <tr className="border-t-2 border-ink font-semibold"><td className="py-1.5 pr-2">Total</td><td className="py-1.5 pr-2 text-right tabular-nums">{fmt(a.pnl.totals.revenue, cur)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{fmt(a.pnl.totals.expenses, cur)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{fmt(a.pnl.totals.vendorBills, cur)}</td><td className="py-1.5 text-right tabular-nums">{fmt(a.pnl.totals.operatingProfit, cur)}{a.pnl.totals.marginPct != null && <span className="ml-1 text-xs font-normal text-muted">({a.pnl.totals.marginPct}%)</span>}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Payables ageing" note="What you owe suppliers, by days past the bill's due date.">
          {a.payablesAgeing.total === 0 ? <p className="text-sm text-muted">No open supplier bills.</p> : <Bars rows={a.payablesAgeing.buckets.map((b) => ({ label: b.label, value: b.amount, display: `${fmt(b.amount, cur)} · ${b.count}`, danger: b.key === 'd61_90' || b.key === 'd90_plus' }))} max={Math.max(1, ...a.payablesAgeing.buckets.map((b) => b.amount))} />}
        </Card>
        <Card title="Currency exposure" note={`Open receivables minus payables per foreign currency, valued in ${a.exposure.rows.length ? 'INR' : cur} at your saved rates. Positive = you gain if the currency strengthens.`}>
          {a.exposure.rows.length === 0 ? <p className="text-sm text-muted">No foreign-currency receivables or payables.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">Currency</th><th className="pb-1 pr-2 text-right">Net</th><th className="pb-1 pr-2 text-right">In INR</th><th className="pb-1 text-right">If it moves 5% against you</th></tr></thead>
              <tbody>{a.exposure.rows.map((r) => (
                <tr key={r.currency} className="border-t border-line"><td className="py-1.5 pr-2 text-ink">{r.currency}</td><td className="py-1.5 pr-2 text-right tabular-nums">{r.net.toLocaleString('en-US')}</td><td className="py-1.5 pr-2 text-right tabular-nums">{r.netBase == null ? <span className="text-amber-800">no rate</span> : r.netBase.toLocaleString('en-US')}</td><td className="py-1.5 text-right tabular-nums text-danger">{r.adverse5 == null ? '—' : r.adverse5.toLocaleString('en-US')}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      </div>

      {a.realization.length > 0 && (
        <Card title="Export proceeds realisation" note="Proceeds are normally due within 9 months of the date of export (shipping bill / bill of lading). Advisory — confirm the period and any extension with your authorised dealer bank.">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">Invoice</th><th className="pb-1 pr-2">Exported</th><th className="pb-1 pr-2">Realise by</th><th className="pb-1 pr-2 text-right">Outstanding</th><th className="pb-1 text-right">Status</th></tr></thead>
            <tbody>{a.realization.slice(0, 15).map((r) => (
              <tr key={r.invoiceId} className="border-t border-line">
                <td className="py-1.5 pr-2"><Link href={`/dashboard/invoices/${r.invoiceId}`} className="text-brand hover:underline">{r.invoiceNumber}</Link></td>
                <td className="py-1.5 pr-2 text-muted">{r.exportDate ? r.exportDate.toISOString().slice(0, 10) : 'not recorded'}</td>
                <td className="py-1.5 pr-2 text-muted">{r.clock.deadline ? r.clock.deadline.toISOString().slice(0, 10) : '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.currency} {r.clock.outstanding.toLocaleString('en-US')}</td>
                <td className={`py-1.5 text-right text-xs font-medium ${r.clock.status === 'overdue' ? 'text-danger' : r.clock.status === 'due_soon' ? 'text-amber-800' : 'text-muted'}`}>{r.clock.status === 'overdue' ? `${-(r.clock.daysLeft ?? 0)} d overdue` : r.clock.status === 'due_soon' ? `${r.clock.daysLeft} d left` : r.clock.status === 'unknown' ? 'add shipment date' : `${r.clock.daysLeft} d left`}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <Card title="Export to your accountant" note="The product keeps the general ledger out of scope — hand these to your accountant or import into Tally. Foreign-currency documents are converted at your saved rates; any without a rate are skipped (the Tally download reports them in its response headers).">
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/api/export/accounting?format=csv" className="rounded-lg border border-line px-4 py-2 text-ink hover:bg-black/[0.02]">Download CSV</a>
          <a href="/api/export/accounting?format=tally" className="rounded-lg border border-line px-4 py-2 text-ink hover:bg-black/[0.02]">Download Tally XML</a>
        </div>
        <p className="mt-2 text-xs text-muted">Tally XML has not been imported into a live Tally company by us — ledger names must already exist there, so try it on a test company first.</p>
      </Card>

      <Card title="Shipment milestones" note="A milestone is on time if it happened by its planned day.">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Stat label="On time" value={a.shipments.onTime} />
          <Stat label="Late" value={a.shipments.late} />
          <Stat label="Overdue, not recorded" value={a.shipments.overdueOpen} danger={a.shipments.overdueOpen > 0} />
          <Stat label="Upcoming" value={a.shipments.upcoming} />
          <Stat label="Avg delay when late" value={a.shipments.avgDelayDays == null ? '—' : `${a.shipments.avgDelayDays} d`} />
        </dl>
      </Card>
    </div>
  );
}

function Tile({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${danger ? 'text-danger' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {note && <p className="mb-4 mt-1 text-xs text-muted">{note}</p>}
      {children}
    </section>
  );
}

function Bars({ rows, max }: { rows: { label: string; value: number; display: string; danger?: boolean }[]; max: number }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-xs capitalize text-muted">{r.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-surface">
            <div className={`h-full rounded ${r.danger ? 'bg-danger/60' : 'bg-brand/70'}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-40 shrink-0 text-right text-xs tabular-nums text-ink">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-lg font-semibold ${danger ? 'text-danger' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}

function MarginCard({ title, report, cur, compact }: { title: string; report: AnalyticsData['marginByBuyer']; cur: string; compact?: boolean }) {
  const rows = compact ? report.rows.slice(0, 8) : report.rows.slice(0, 15);
  return (
    <Card title={title} note="Quoted margin: sell price vs. the cost recorded on each quote line, for non-cancelled orders.">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No orders with costed quote lines yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">Name</th><th className="pb-1 pr-2 text-right">Revenue</th><th className="pb-1 pr-2 text-right">Margin</th><th className="pb-1 text-right">%</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className="py-1.5 pr-2 text-ink">{r.label} <span className="text-xs text-muted">· {r.orders} order{r.orders > 1 ? 's' : ''}</span></td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.revenue, cur)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.margin, cur)}</td>
                  <td className={`py-1.5 text-right tabular-nums ${r.marginPct != null && r.marginPct < 10 ? 'text-danger' : 'text-ink'}`}>{r.marginPct == null ? '—' : `${r.marginPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report.linesWithoutCost > 0 && (
        <p className="mt-3 text-xs text-muted">{report.linesWithoutCost} quote line(s) have no recorded cost and are left out of margin — add a cost to include them.</p>
      )}
    </Card>
  );
}
