'use server';

import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { buildGstPrepPack, periodBounds, type GstPrepPack } from '@/lib/gst-prep';

/**
 * Assemble the GST filing-prep pack for a month (CEO 2026-07-12: prepare + route to CA, never file). Reads
 * the period's expenses (input/ITC side) and invoices (zero-rated export turnover) and aggregates them with
 * the pure builder. Gated on compliance:read — this is the finance/CA-facing prep surface.
 */
export async function getGstPrepPack(period: string): Promise<GstPrepPack> {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'compliance:read')) throw new Error('You do not have access to GST prep');

  const { start, end } = periodBounds(period);

  const [expenses, invoices] = await Promise.all([
    prisma.expense.findMany({
      where: { tenantId, expenseDate: { gte: start, lt: end } },
      select: {
        id: true,
        status: true,
        gstHead: true,
        itcEligible: true,
        amount: true,
        currency: true,
        vendorName: true,
        expenseDate: true,
      },
    }),
    prisma.invoice.findMany({
      where: { tenantId, isDemo: false, createdAt: { gte: start, lt: end } },
      select: { id: true, currency: true, total: true, isCreditOrDebitNote: true },
    }),
  ]);

  return buildGstPrepPack(period, expenses, invoices);
}
