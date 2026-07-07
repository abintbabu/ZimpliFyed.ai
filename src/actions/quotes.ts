'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import {
  withDefaultExpenseMargin,
  marginPctFromCostExpensePrice,
  DEFAULT_EXPENSE_PCT,
  DEFAULT_MARGIN_PCT,
} from '@/lib/pricing-buildup';
import type { QuoteStatus } from '@prisma/client';

type QuoteLineInput = {
  description: string;
  quantity: number;
  cost: number;
  expensePct?: number;
  marginPct?: number;
  unitPrice: number;
};

function buildLineTotals(lines: QuoteLineInput[]) {
  const withDefaults = withDefaultExpenseMargin(
    lines.map(l => ({ ...l, lineTotal: parseFloat((l.quantity * l.unitPrice).toFixed(2)) })),
  ).map(l => ({
    ...l,
    expensePct: l.expensePct ?? DEFAULT_EXPENSE_PCT,
    marginPct: l.marginPct ?? DEFAULT_MARGIN_PCT,
  }));
  const total = withDefaults.reduce((sum, l) => sum + l.lineTotal, 0);
  const marginPcts = withDefaults.map(l => l.marginPct).filter((m): m is number => m != null);
  const overallMarginPct = marginPcts.length
    ? parseFloat((marginPcts.reduce((a, b) => a + b, 0) / marginPcts.length).toFixed(2))
    : undefined;
  return { lines: withDefaults, total: parseFloat(total.toFixed(2)), overallMarginPct };
}

export async function listQuotes(tenantId: string) {
  return prisma.quote.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { createdAt: 'desc' } });
}

export async function getQuote(tenantId: string, quoteId: string) {
  return prisma.quote.findFirst({ where: { id: quoteId, tenantId }, include: { lines: true } });
}

export async function createQuote(input: { quoteNumber: string; leadId?: string; currency?: string; lines: QuoteLineInput[] }) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to create quotes');

  const { lines, total, overallMarginPct } = buildLineTotals(input.lines);

  const quote = await prisma.quote.create({
    data: {
      tenantId,
      quoteNumber: input.quoteNumber,
      leadId: input.leadId || null,
      currency: input.currency || 'USD',
      total,
      overallMarginPct,
      lines: { create: lines },
    },
  });

  await writeAudit({
    session,
    collection: 'quotes',
    documentId: quote.id,
    action: 'create',
    summary: `Created quote ${quote.quoteNumber}`,
    after: { quoteNumber: quote.quoteNumber, total: quote.total, currency: quote.currency },
  });

  revalidatePath('/dashboard/quotes');
  return quote;
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to update quotes');

  const before = await prisma.quote.findFirst({ where: { id: quoteId, tenantId } });
  if (!before) throw new Error('Quote not found');

  await prisma.quote.update({ where: { id: quoteId, tenantId }, data: { status } });

  await writeAudit({
    session,
    collection: 'quotes',
    documentId: quoteId,
    action: 'status_change',
    summary: `Quote ${before.quoteNumber} status: ${before.status} -> ${status}`,
    before: { status: before.status },
    after: { status },
  });

  revalidatePath('/dashboard/quotes');
  revalidatePath(`/dashboard/quotes/${quoteId}`);
}

export { marginPctFromCostExpensePrice };
