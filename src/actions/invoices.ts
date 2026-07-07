'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { withDefaultExpenseMargin, DEFAULT_EXPENSE_PCT, DEFAULT_MARGIN_PCT } from '@/lib/pricing-buildup';
import type { InvoiceStatus } from '@prisma/client';

type InvoiceLineInput = {
  description: string;
  quantity: number;
  cost: number;
  expensePct?: number;
  marginPct?: number;
  unitPrice: number;
};

function buildLineTotals(lines: InvoiceLineInput[]) {
  const withDefaults = withDefaultExpenseMargin(
    lines.map(l => ({ ...l, lineTotal: parseFloat((l.quantity * l.unitPrice).toFixed(2)) })),
  ).map(l => ({
    ...l,
    expensePct: l.expensePct ?? DEFAULT_EXPENSE_PCT,
    marginPct: l.marginPct ?? DEFAULT_MARGIN_PCT,
  }));
  const total = withDefaults.reduce((sum, l) => sum + l.lineTotal, 0);
  return { lines: withDefaults, total: parseFloat(total.toFixed(2)) };
}

export async function listInvoices(tenantId: string) {
  return prisma.invoice.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { createdAt: 'desc' } });
}

export async function getInvoice(tenantId: string, invoiceId: string) {
  return prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, include: { lines: true } });
}

export async function createInvoice(input: {
  invoiceNumber: string;
  orderId?: string;
  currency?: string;
  dueDate?: Date;
  isCreditOrDebitNote?: boolean;
  lines: InvoiceLineInput[];
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to create invoices');

  const { lines, total } = buildLineTotals(input.lines);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber: input.invoiceNumber,
      orderId: input.orderId || null,
      currency: input.currency || 'USD',
      total,
      balanceDue: total,
      dueDate: input.dueDate || null,
      isCreditOrDebitNote: input.isCreditOrDebitNote ?? false,
      lines: { create: lines },
    },
  });

  await writeAudit({
    session,
    collection: 'invoices',
    documentId: invoice.id,
    action: 'create',
    summary: `Created invoice ${invoice.invoiceNumber}`,
    after: { invoiceNumber: invoice.invoiceNumber, total: invoice.total, currency: invoice.currency },
  });

  revalidatePath('/dashboard/invoices');
  return invoice;
}

export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus, balanceDue?: number) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to update invoices');

  const before = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!before) throw new Error('Invoice not found');

  await prisma.invoice.update({
    where: { id: invoiceId, tenantId },
    data: { status, ...(balanceDue != null ? { balanceDue } : {}) },
  });

  const auditAction = status === 'paid' ? 'mark_paid' : before.status === 'paid' ? 'mark_unpaid' : 'status_change';
  await writeAudit({
    session,
    collection: 'invoices',
    documentId: invoiceId,
    action: auditAction,
    summary: `Invoice ${before.invoiceNumber} status: ${before.status} -> ${status}`,
    before: { status: before.status, balanceDue: before.balanceDue },
    after: { status, balanceDue: balanceDue ?? before.balanceDue },
  });

  revalidatePath('/dashboard/invoices');
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
}
