'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { computeLandedCost } from '@/lib/landed-cost';
import { suggestFreightPerUnit, type FreightSuggestion } from '@/lib/freight-allocation';
import { latestRates } from '@/lib/fx';
import { suggestCostsFromHistory, type CostSuggestion } from '@/lib/cost-history';
import type { CostCategory } from '@prisma/client';

type CostLineInput = { category: CostCategory; label?: string; amountPerUnit: number };

export async function getCostSheet(quoteId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'quotes:read')) throw new Error('You do not have permission to view this');
  return prisma.costSheet.findFirst({ where: { quoteId, tenantId }, include: { lines: true } });
}

export async function saveCostSheet(input: {
  quoteId: string;
  incoterm: string;
  sellPricePerUnit: number;
  rodtepPct: number;
  lines: CostLineInput[];
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to edit cost sheets');

  const quote = await prisma.quote.findFirst({ where: { id: input.quoteId, tenantId } });
  if (!quote) throw new Error('Quote not found');

  const existing = await prisma.costSheet.findFirst({ where: { quoteId: input.quoteId, tenantId } });

  const costSheet = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.costSheetLine.deleteMany({ where: { costSheetId: existing.id } });
      return tx.costSheet.update({
        where: { id: existing.id },
        data: {
          incoterm: input.incoterm,
          sellPricePerUnit: input.sellPricePerUnit,
          rodtepPct: input.rodtepPct,
          lines: { create: input.lines },
        },
        include: { lines: true },
      });
    }
    return tx.costSheet.create({
      data: {
        tenantId,
        quoteId: input.quoteId,
        incoterm: input.incoterm,
        sellPricePerUnit: input.sellPricePerUnit,
        rodtepPct: input.rodtepPct,
        lines: { create: input.lines },
      },
      include: { lines: true },
    });
  });

  const result = computeLandedCost({
    incoterm: input.incoterm,
    sellPricePerUnit: input.sellPricePerUnit,
    rodtepPct: input.rodtepPct,
    lines: input.lines,
  });

  await writeAudit({
    session,
    collection: 'quotes',
    documentId: input.quoteId,
    action: 'pricing_change',
    summary: `Updated cost sheet for quote ${quote.quoteNumber} (${input.incoterm}): landed margin ${result.landedMarginPct ?? '—'}%`,
    after: { incoterm: input.incoterm, landedCostPerUnit: result.landedCostPerUnit, landedMarginPct: result.landedMarginPct },
  });

  revalidatePath(`/dashboard/quotes/${input.quoteId}`);
  return costSheet;
}

/**
 * Read-only: per-unit freight for a quote's order, from the accepted forwarder quote(s) on the shipment(s)
 * that carry it. Nothing is written — the cost-sheet panel merges the figure into its freight line and the
 * user reviews and saves, so a sheet never changes behind their back.
 */
export async function suggestFreightForQuote(quoteId: string): Promise<FreightSuggestion | { unavailable: string }> {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'quotes:read')) return { unavailable: 'You do not have access to quotes.' };

  const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId }, include: { lines: true } });
  if (!quote) return { unavailable: 'Quote not found.' };
  if (!quote.orderId) return { unavailable: 'Freight comes from a shipment, so the quote needs to be converted to an order and shipped first.' };

  const [shipments, snapshots] = await Promise.all([
    prisma.shipment.findMany({
      where: { tenantId, orders: { some: { orderId: quote.orderId } } },
      include: {
        freightQuotes: { where: { status: 'accepted' } },
        orders: { include: { order: { include: { lines: true, quote: true } } } },
      },
    }),
    prisma.fxSnapshot.findMany({ where: { tenantId }, orderBy: { asOf: 'desc' }, take: 200 }),
  ]);

  const accepted = shipments.flatMap((s) =>
    s.freightQuotes
      .filter((q) => q.amount != null)
      .map((q) => ({
        shipmentNumber: s.shipmentNumber,
        amount: q.amount as number,
        currency: q.currency,
        forwarderName: q.forwarderName,
        orders: s.orders.map((so) => ({
          orderId: so.orderId,
          value: so.order.lines.length ? so.order.lines.reduce((sum, l) => sum + l.lineTotal, 0) : so.order.quote?.total ?? 0,
        })),
      })),
  );

  return suggestFreightPerUnit({
    orderId: quote.orderId,
    quantity: quote.lines.reduce((sum, l) => sum + l.quantity, 0),
    targetCurrency: quote.currency,
    rates: latestRates(snapshots),
    shipments: accepted,
  });
}

/** Read-only: per-head suggestions from this tenant's past cost sheets (same currency, nearest Incoterm). */
export async function suggestCostsForQuote(quoteId: string, incoterm: string): Promise<{ suggestions: CostSuggestion[]; currency: string } | { unavailable: string }> {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'quotes:read')) return { unavailable: 'You do not have access to quotes.' };

  const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId }, select: { currency: true } });
  if (!quote) return { unavailable: 'Quote not found.' };

  const sheets = await prisma.costSheet.findMany({
    where: { tenantId, isDemo: false, quoteId: { not: quoteId } },
    include: { lines: true, quote: { select: { currency: true } } },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  const suggestions = suggestCostsFromHistory(
    sheets.map((s) => ({ quoteId: s.quoteId, incoterm: s.incoterm, currency: s.quote.currency, createdAt: s.createdAt, lines: s.lines })),
    { incoterm, currency: quote.currency },
    quoteId,
  );
  return { suggestions, currency: quote.currency };
}
