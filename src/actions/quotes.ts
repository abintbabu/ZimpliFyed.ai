'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { writeDomainEvent } from '@/lib/domain-events';
import {
  withDefaultExpenseMargin,
  marginPctFromCostExpensePrice,
  DEFAULT_EXPENSE_PCT,
  DEFAULT_MARGIN_PCT,
  MARGIN_FLOOR_PCT,
} from '@/lib/pricing-buildup';
import type { QuoteStatus } from '@prisma/client';

type QuoteLineInput = {
  productId?: string;
  description: string;
  quantity: number;
  cost: number;
  expensePct?: number;
  marginPct?: number;
  unitPrice: number;
};

function enforceMarginFloor(lines: { marginPct?: number; description: string }[], role: string, allowOverride?: boolean) {
  const breach = lines.find((l) => l.marginPct != null && l.marginPct < MARGIN_FLOOR_PCT);
  if (!breach) return;
  const canOverride = allowOverride && (role === 'admin' || role === 'super_admin');
  if (!canOverride) {
    throw new Error(
      `Line "${breach.description}" is priced at ${breach.marginPct}% margin, below the ${MARGIN_FLOOR_PCT}% floor. An admin must override to save this quote.`,
    );
  }
}

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
  return prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    include: { lines: true, buyer: true, parentQuote: true, revisions: { orderBy: { version: 'asc' } } },
  });
}

export async function createQuote(input: {
  quoteNumber: string;
  leadId?: string;
  buyerId?: string;
  currency?: string;
  lines: QuoteLineInput[];
  overrideMarginFloor?: boolean;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to create quotes');

  const { lines, total, overallMarginPct } = buildLineTotals(input.lines);
  enforceMarginFloor(lines, role, input.overrideMarginFloor);

  const quote = await prisma.quote.create({
    data: {
      tenantId,
      quoteNumber: input.quoteNumber,
      leadId: input.leadId || null,
      buyerId: input.buyerId || null,
      currency: input.currency || 'USD',
      total,
      overallMarginPct,
      lines: { create: lines.map((l) => ({ ...l, productId: l.productId || null })) },
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

export async function updateQuoteLines(quoteId: string, lines: QuoteLineInput[], overrideMarginFloor?: boolean) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to edit quotes');

  const before = await prisma.quote.findFirst({ where: { id: quoteId, tenantId } });
  if (!before) throw new Error('Quote not found');

  const { lines: withTotals, total, overallMarginPct } = buildLineTotals(lines);
  enforceMarginFloor(withTotals, role, overrideMarginFloor);

  const quote = await prisma.$transaction(async (tx) => {
    await tx.quoteLineItem.deleteMany({ where: { quoteId } });
    return tx.quote.update({
      where: { id: quoteId, tenantId },
      data: { total, overallMarginPct, lines: { create: withTotals.map((l) => ({ ...l, productId: l.productId || null })) } },
      include: { lines: true },
    });
  });

  await writeAudit({
    session,
    collection: 'quotes',
    documentId: quoteId,
    action: 'update',
    summary: `Updated line items for quote ${before.quoteNumber}`,
    before: { total: before.total },
    after: { total: quote.total },
  });

  revalidatePath(`/dashboard/quotes/${quoteId}`);
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
  if (status === 'sent') {
    await writeDomainEvent(prisma, { tenantId, type: 'quote.sent', refId: quoteId, payload: { quoteNumber: before.quoteNumber } });
  }

  revalidatePath('/dashboard/quotes');
  revalidatePath(`/dashboard/quotes/${quoteId}`);
}

/** Revises a quote: creates a new draft quote at version+1, carrying over the buyer and line items, chained via parentQuoteId. */
export async function reviseQuote(quoteId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to revise quotes');

  const original = await prisma.quote.findFirst({ where: { id: quoteId, tenantId }, include: { lines: true } });
  if (!original) throw new Error('Quote not found');

  const revision = await prisma.quote.create({
    data: {
      tenantId,
      quoteNumber: `${original.quoteNumber}-v${original.version + 1}`,
      leadId: original.leadId,
      buyerId: original.buyerId,
      currency: original.currency,
      total: original.total,
      overallMarginPct: original.overallMarginPct,
      version: original.version + 1,
      parentQuoteId: original.id,
      lines: {
        create: original.lines.map((l) => ({
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          cost: l.cost,
          expensePct: l.expensePct,
          marginPct: l.marginPct,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
      },
    },
  });

  await writeAudit({
    session,
    collection: 'quotes',
    documentId: revision.id,
    action: 'create',
    summary: `Revised quote ${original.quoteNumber} into ${revision.quoteNumber}`,
    after: { parentQuoteId: original.id, version: revision.version },
  });

  revalidatePath('/dashboard/quotes');
  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return revision;
}

function generateShareToken() {
  return randomBytes(16).toString('hex');
}

/** Creates (or rotates) the buyer-facing share link for a quote. Link expires in 30 days by default. */
export async function createQuoteShareLink(quoteId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to share this quote');

  const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId } });
  if (!quote) throw new Error('Quote not found');

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const updated = await prisma.quote.update({
    where: { id: quoteId, tenantId },
    data: { shareToken: generateShareToken(), expiresAt },
  });

  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return updated;
}

export async function revokeQuoteShareLink(quoteId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to revoke this link');

  await prisma.quote.update({ where: { id: quoteId, tenantId }, data: { shareToken: null, expiresAt: null } });
  revalidatePath(`/dashboard/quotes/${quoteId}`);
}

/** Buyer-facing, unauthenticated. Only returns fields safe to expose externally — no internal cost/margin data. */
export async function getQuoteByShareToken(token: string) {
  const quote = await prisma.quote.findUnique({ // tenant-safe: buyer-facing public share-token lookup, intentionally cross-tenant; returns only externally-safe fields
    where: { shareToken: token },
    include: { lines: true, buyer: true },
  });
  if (!quote) return null;
  if (quote.expiresAt && quote.expiresAt < new Date()) return null;

  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    currency: quote.currency,
    total: quote.total,
    buyerName: quote.buyer?.name,
    lines: quote.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
  };
}

/** Buyer-facing action from the public share link: accept or request changes (logged as a buyer activity). */
export async function respondToSharedQuote(token: string, response: 'accept' | 'request_changes', note?: string) {
  const found = await prisma.quote.findUnique({ where: { shareToken: token } }); // tenant-safe: buyer-facing public share-token flow, intentionally cross-tenant
  if (!found) throw new Error('Quote link not found or expired');
  if (found.expiresAt && found.expiresAt < new Date()) throw new Error('This quote link has expired');

  if (response === 'accept') {
    await prisma.quote.update({ where: { id: found.id }, data: { status: 'accepted' } }); // tenant-safe: id from the verified share-token lookup above
  }

  if (found.buyerId) {
    await prisma.activity.create({
      data: {
        tenantId: found.tenantId,
        entityType: 'buyer',
        entityId: found.buyerId,
        kind: 'system',
        subject: response === 'accept' ? `Buyer accepted quote ${found.quoteNumber}` : `Buyer requested changes on quote ${found.quoteNumber}`,
        body: note?.trim() || null,
      },
    });
  }

  revalidatePath(`/dashboard/quotes/${found.id}`);
}

export { marginPctFromCostExpensePrice };
