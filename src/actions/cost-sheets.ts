'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { computeLandedCost } from '@/lib/landed-cost';
import type { CostCategory } from '@prisma/client';

type CostLineInput = { category: CostCategory; label?: string; amountPerUnit: number };

export async function getCostSheet(tenantId: string, quoteId: string) {
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
