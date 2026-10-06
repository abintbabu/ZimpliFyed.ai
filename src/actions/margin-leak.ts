'use server';

import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { computeLandedCost } from '@/lib/landed-cost';
import { explainMarginGap, type MarginLeakReport } from '@/lib/margin-leak';

/** Where an order's margin went: quoted vs actual, split into amounts that add up to the gap. */
export async function getOrderMarginLeak(orderId: string): Promise<(MarginLeakReport & { currency: string }) | null> {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'reports:pnl') && !hasPermission(role, 'analytics:read')) return null;

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { quote: { include: { lines: true, costSheet: { include: { lines: true } } } }, invoices: true },
  });
  if (!order?.quote) return null;
  const q = order.quote;

  const quotedRevenue = q.total;
  const quotedCost = q.lines.reduce((s, l) => s + l.cost * l.quantity, 0);
  const qty = q.lines.reduce((s, l) => s + l.quantity, 0);
  const actualCost = q.costSheet
    ? computeLandedCost({ incoterm: q.costSheet.incoterm, sellPricePerUnit: q.costSheet.sellPricePerUnit, rodtepPct: q.costSheet.rodtepPct, lines: q.costSheet.lines }).landedCostPerUnit * qty
    : quotedCost;

  const live = order.invoices.filter((i) => i.status !== 'draft' && i.status !== 'void');
  const credit = (i: (typeof live)[number]) => (i.isCreditOrDebitNote && (i.noteKind ?? 'credit') === 'credit');
  const debit = (i: (typeof live)[number]) => i.isCreditOrDebitNote && i.noteKind === 'debit';
  const [incentives, expenses] = await Promise.all([
    prisma.incentiveClaim.findMany({ where: { tenantId, orderId, status: { in: ['claimed', 'received'] } }, select: { amount: true } }),
    prisma.expense.findMany({ where: { tenantId, orderId, status: { in: ['auto_posted', 'approved'] }, amount: { not: null } }, select: { amount: true } }),
  ]);

  return {
    currency: q.currency,
    ...explainMarginGap({
      quotedRevenue, quotedCost,
      grossInvoiced: live.filter((i) => !i.isCreditOrDebitNote).reduce((s, i) => s + i.total, 0),
      creditNotes: live.filter(credit).reduce((s, i) => s + i.total, 0),
      debitNotes: live.filter(debit).reduce((s, i) => s + i.total, 0),
      actualCost,
      bookedExpenses: expenses.reduce((s, e) => s + (e.amount ?? 0), 0),
      incentives: incentives.reduce((s, c) => s + c.amount, 0),
    }),
  };
}
