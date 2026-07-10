'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';

export async function listBankRealizations(tenantId: string, invoiceId: string) {
  return prisma.bankRealization.findMany({ where: { tenantId, invoiceId }, orderBy: { realizedAt: 'desc' } });
}

/** Keeps Invoice.balanceDue/status derived from its realizations — the single source the
 * founder brief, dashboard alerts, and invoice list already read for receivables. */
async function syncInvoiceBalance(tenantId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, include: { bankRealizations: true } });
  if (!invoice) return;

  const realized = invoice.bankRealizations.reduce((sum, r) => sum + r.realizedAmount, 0);
  const balanceDue = Math.max(parseFloat((invoice.total - realized).toFixed(2)), 0);
  const status = balanceDue <= 0.01 ? 'paid' : realized > 0 ? 'partially_paid' : invoice.status === 'paid' || invoice.status === 'partially_paid' ? 'sent' : invoice.status;

  await prisma.invoice.update({ where: { id: invoiceId }, data: { balanceDue, status } });
}

export async function recordBankRealization(input: {
  invoiceId: string;
  fircNumber?: string;
  ebrcNumber?: string;
  bankName?: string;
  realizedAmount: number;
  realizedCurrency?: string;
  realizedAt: Date;
  notes?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('Not permitted');

  const invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, tenantId } });
  if (!invoice) throw new Error('Invoice not found');

  const realization = await prisma.bankRealization.create({
    data: {
      tenantId,
      invoiceId: input.invoiceId,
      fircNumber: input.fircNumber,
      ebrcNumber: input.ebrcNumber,
      bankName: input.bankName,
      realizedAmount: input.realizedAmount,
      realizedCurrency: input.realizedCurrency ?? invoice.currency,
      realizedAt: input.realizedAt,
      notes: input.notes,
    },
  });

  await syncInvoiceBalance(tenantId, invoice.id);

  await writeAudit({
    session,
    collection: 'invoices',
    documentId: invoice.id,
    action: 'create',
    summary: `Recorded bank realization of ${realization.realizedCurrency} ${realization.realizedAmount} against invoice ${invoice.invoiceNumber}`,
    after: { realizationId: realization.id, amount: realization.realizedAmount },
  });

  revalidatePath(`/dashboard/invoices/${invoice.id}`);
  revalidatePath('/dashboard/invoices');
  return realization;
}

export async function deleteBankRealization(realizationId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('Not permitted');

  const realization = await prisma.bankRealization.findFirst({ where: { id: realizationId, tenantId } });
  if (!realization) throw new Error('Not found');

  await prisma.bankRealization.delete({ where: { id: realizationId } });
  await syncInvoiceBalance(tenantId, realization.invoiceId);

  await writeAudit({
    session,
    collection: 'invoices',
    documentId: realization.invoiceId,
    action: 'delete',
    summary: `Removed bank realization ${realizationId}`,
    before: { realizationId, amount: realization.realizedAmount },
  });

  revalidatePath(`/dashboard/invoices/${realization.invoiceId}`);
  revalidatePath('/dashboard/invoices');
}

/**
 * Tenant-wide reconciliation summary for the founder brief / cash-flow work:
 * export invoices not yet fully realized against a bank credit advice, oldest
 * first. `balanceDue` is kept in sync with realizations by `syncInvoiceBalance`,
 * so it's the same figure the dashboard and founder brief already read.
 */
export async function unreconciledInvoices(tenantId: string) {
  return prisma.invoice.findMany({
    where: { tenantId, isCreditOrDebitNote: false, status: { not: 'draft' }, balanceDue: { gt: 0.01 } },
    include: { bankRealizations: true },
    orderBy: { createdAt: 'asc' },
  });
}
