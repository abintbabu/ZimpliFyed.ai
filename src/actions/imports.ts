'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { allocateDocNumber } from '@/lib/doc-number-alloc';
import { computeImportLandedCost } from '@/lib/import-landed-cost';

export async function listImportEntries() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return [];
  return prisma.importEntry.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { createdAt: 'desc' } });
}

export async function getImportEntry(id: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return null;
  return prisma.importEntry.findFirst({ where: { id, tenantId }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
}

export async function createImportEntry(input: { currency: string; exchangeRate: number; vendorId?: string }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to create import entries');
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a 3-letter code');
  if (!(input.exchangeRate > 0)) throw new Error('Enter the customs exchange rate (INR per 1 unit of the invoice currency)');
  if (input.vendorId && !(await prisma.vendor.findFirst({ where: { id: input.vendorId, tenantId }, select: { id: true } }))) throw new Error('Vendor not found');

  const entryNumber = await allocateDocNumber(tenantId, 'IMP');
  const entry = await prisma.importEntry.create({ data: { tenantId, entryNumber, currency, exchangeRate: input.exchangeRate, vendorId: input.vendorId || null, createdByUserId: userId } });
  await writeAudit({ session, collection: 'import_entries', documentId: entry.id, action: 'create', summary: `Created import entry ${entryNumber}`, after: { currency, exchangeRate: input.exchangeRate } });
  revalidatePath('/dashboard/imports');
  return entry;
}

type LineIn = { description: string; hsCode?: string | null; quantity: number; unitPrice: number; bcdPct: number; swsPct: number; igstPct: number; otherDutyPct?: number };

/** Saves an entry's header, costs and lines. The numbers are validated by running the real costing engine first. */
export async function saveImportEntry(id: string, input: {
  boeNumber?: string | null; boeDate?: string | null; exchangeRate: number;
  freightInr: number; insuranceInr: number; portInr: number; chaInr: number; transportInr: number; warehousingInr: number; otherInr: number;
  lines: LineIn[];
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to edit import entries');
  const entry = await prisma.importEntry.findFirst({ where: { id, tenantId } });
  if (!entry) throw new Error('Import entry not found');
  if (entry.status === 'cleared') throw new Error('A cleared entry is locked');

  const lines = input.lines.filter((l) => l.description.trim());
  const costs = [input.freightInr, input.insuranceInr, input.portInr, input.chaInr, input.transportInr, input.warehousingInr, input.otherInr];
  if (costs.some((c) => !Number.isFinite(c) || c < 0)) throw new Error('Costs cannot be negative');
  const result = computeImportLandedCost({ currency: entry.currency, exchangeRate: input.exchangeRate, freightInr: input.freightInr, insuranceInr: input.insuranceInr, portInr: input.portInr, chaInr: input.chaInr, transportInr: input.transportInr, warehousingInr: input.warehousingInr, otherInr: input.otherInr, lines }); // throws a readable message on bad input

  let boeDate: Date | null = null;
  if (input.boeDate) { boeDate = new Date(`${input.boeDate}T00:00:00Z`); if (Number.isNaN(boeDate.getTime())) throw new Error('Bill of entry date is not valid'); }

  await prisma.$transaction(async (tx) => {
    await tx.importEntryLine.deleteMany({ where: { entryId: id } });
    await tx.importEntry.update({
      where: { id, tenantId },
      data: {
        boeNumber: input.boeNumber?.trim() || null, boeDate, exchangeRate: input.exchangeRate,
        freightInr: input.freightInr, insuranceInr: input.insuranceInr, portInr: input.portInr, chaInr: input.chaInr, transportInr: input.transportInr, warehousingInr: input.warehousingInr, otherInr: input.otherInr,
        lines: { create: lines.map((l, i) => ({ description: l.description.trim(), hsCode: l.hsCode?.replace(/[\s.]/g, '') || null, quantity: l.quantity, unitPrice: l.unitPrice, bcdPct: l.bcdPct, swsPct: l.swsPct, igstPct: l.igstPct, otherDutyPct: l.otherDutyPct ?? 0, sortOrder: i })) },
      },
    });
  });
  await writeAudit({ session, collection: 'import_entries', documentId: id, action: 'update', summary: `Saved import entry ${entry.entryNumber}: landed cost ${result.totals.landedCost}`, after: { landedCost: result.totals.landedCost, igst: result.totals.igst } });
  revalidatePath(`/dashboard/imports/${id}`);
  revalidatePath('/dashboard/imports');
  return { landedCost: result.totals.landedCost };
}

export async function setImportEntryStatus(id: string, status: 'draft' | 'assessed' | 'cleared') {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to edit import entries');
  const entry = await prisma.importEntry.findFirst({ where: { id, tenantId }, include: { lines: true } });
  if (!entry) throw new Error('Import entry not found');
  if (status !== 'draft' && entry.lines.length === 0) throw new Error('Add at least one line first');
  if (entry.status === 'cleared') throw new Error('A cleared entry is locked');
  await prisma.importEntry.update({ where: { id, tenantId }, data: { status } });
  await writeAudit({ session, collection: 'import_entries', documentId: id, action: 'status_change', summary: `${entry.entryNumber}: ${entry.status} → ${status}`, before: { status: entry.status }, after: { status } });
  revalidatePath(`/dashboard/imports/${id}`);
  revalidatePath('/dashboard/imports');
}
