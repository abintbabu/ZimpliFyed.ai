import 'server-only';
import { prisma } from './prisma';
import { latestRates, planReporting, DEFAULT_BASE_CURRENCY } from './fx';
import { companyPnl } from './company-pnl';
import { fxExposure } from './fx-exposure';
import { billBalance } from './payables';
import { loadRealizationClocks } from './realization-loader';
import {
  receivablesAgeing, revenueByMonth, marginBreakdown, orderPipeline, shipmentPerformance,
  type InvoiceRow, type MarginOrder,
} from './analytics';

/**
 * Loads one tenant's data once and runs every report over it. Demo rows are excluded so a tenant exploring
 * with seeded data doesn't see it blended into real figures. All amounts are expressed in a single
 * reporting currency (see fx.ts); anything without an exchange rate is excluded and counted.
 */
export async function loadAnalytics(tenantId: string, now = new Date()) {
  const [invoices, orders, milestones, fx, bills, expenses, realization] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, isDemo: false },
      select: { total: true, balanceDue: true, currency: true, status: true, dueDate: true, createdAt: true, isCreditOrDebitNote: true, noteKind: true },
    }),
    prisma.order.findMany({
      where: { tenantId, isDemo: false },
      select: {
        status: true, currency: true,
        buyer: { select: { name: true, country: true } },
        destination: true,
        lines: { select: { description: true, quantity: true, unitPrice: true, lineTotal: true } },
        quote: { select: { currency: true, total: true, lines: { select: { description: true, quantity: true, cost: true, lineTotal: true } } } },
      },
    }),
    prisma.shipmentMilestone.findMany({ where: { tenantId }, select: { plannedAt: true, actualAt: true } }),
    prisma.fxSnapshot.findMany({ where: { tenantId }, orderBy: { asOf: 'desc' }, take: 200 }),
    prisma.vendorBill.findMany({ where: { tenantId }, include: { payments: { select: { amount: true } } } }),
    prisma.expense.findMany({ where: { tenantId, status: { in: ['auto_posted', 'approved'] }, amount: { not: null }, expenseDate: { not: null } }, select: { amount: true, currency: true, expenseDate: true } }),
    loadRealizationClocks(tenantId, now),
  ]);

  const orderCurrency = (o: (typeof orders)[number]) => o.currency ?? o.quote?.currency ?? 'USD';
  const orderValue = (o: (typeof orders)[number]) =>
    o.lines.length ? o.lines.reduce((s, l) => s + l.lineTotal, 0) : o.quote?.total ?? 0;

  const rates = latestRates(fx);
  const plan = planReporting([...invoices.map((i) => i.currency), ...orders.map(orderCurrency), ...bills.map((b) => b.currency)], rates);

  const invoiceRows: InvoiceRow[] = invoices;
  // Margin uses the quote's recorded cost (order lines carry price only), so it is the *quoted* margin.
  const marginOrders: MarginOrder[] = orders
    .filter((o) => o.quote)
    .map((o) => ({
      buyerName: o.buyer?.name ?? null,
      country: o.buyer?.country ?? o.destination ?? null,
      status: o.status,
      currency: orderCurrency(o),
      lines: o.quote!.lines,
    }));

  return {
    asOf: now,
    reportingCurrency: plan.reportingCurrency,
    converted: plan.converted,
    unconvertedCurrencies: plan.unconverted,
    ageing: receivablesAgeing(invoiceRows, now, plan),
    revenue: revenueByMonth(invoiceRows, now, plan, 12),
    marginByBuyer: marginBreakdown(marginOrders, 'buyer', plan),
    marginByCountry: marginBreakdown(marginOrders, 'country', plan),
    marginByProduct: marginBreakdown(marginOrders, 'product', plan),
    pipeline: orderPipeline(orders.map((o) => ({ status: o.status, value: orderValue(o), currency: orderCurrency(o) })), plan),
    shipments: shipmentPerformance(milestones, now),
    payablesAgeing: receivablesAgeing(
      bills.filter((b) => b.status !== 'void' && b.status !== 'paid').map((b) => ({ total: b.total, balanceDue: billBalance(b.total, b.payments), currency: b.currency, status: 'sent', dueDate: b.dueDate, createdAt: b.billDate, isCreditOrDebitNote: false })),
      now, plan,
    ),
    pnl: companyPnl({
      invoices: invoiceRows,
      expenses: expenses.map((e) => ({ amount: e.amount as number, currency: e.currency, date: e.expenseDate as Date })),
      bills: bills.map((b) => ({ total: b.total, currency: b.currency, billDate: b.billDate, status: b.status })),
      now, months: 6, plan,
    }),
    exposure: fxExposure({
      receivables: invoices.filter((i) => !i.isCreditOrDebitNote && ['sent', 'partially_paid', 'overdue'].includes(i.status) && i.balanceDue > 0.01).map((i) => ({ currency: i.currency, amount: i.balanceDue })),
      payables: bills.filter((b) => b.status !== 'void' && b.status !== 'paid').map((b) => ({ currency: b.currency, amount: billBalance(b.total, b.payments) })),
      rates, baseCurrency: DEFAULT_BASE_CURRENCY,
    }),
    realization: realization.filter((r) => r.clock.status !== 'realized').sort((a, b) => (a.clock.daysLeft ?? 99999) - (b.clock.daysLeft ?? 99999)),
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof loadAnalytics>>;
