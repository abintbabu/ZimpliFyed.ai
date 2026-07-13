'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { writeDomainEvent } from '@/lib/domain-events';
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
  templateId?: string;
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
      templateId: input.templateId || null,
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

export async function updateInvoiceLines(invoiceId: string, lines: InvoiceLineInput[]) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to edit invoices');

  const before = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!before) throw new Error('Invoice not found');

  const { lines: withTotals, total } = buildLineTotals(lines);
  const paidSoFar = before.total - before.balanceDue;
  const balanceDue = Math.max(total - paidSoFar, 0);

  const invoice = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId } });
    return tx.invoice.update({
      where: { id: invoiceId, tenantId },
      data: { total, balanceDue, lines: { create: withTotals } },
      include: { lines: true },
    });
  });

  await writeAudit({
    session,
    collection: 'invoices',
    documentId: invoiceId,
    action: 'update',
    summary: `Updated line items for invoice ${before.invoiceNumber}`,
    before: { total: before.total, balanceDue: before.balanceDue },
    after: { total: invoice.total, balanceDue: invoice.balanceDue },
  });

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
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
  if (status === 'paid') {
    await writeDomainEvent(prisma, { tenantId, type: 'invoice.paid', refId: invoiceId, payload: { invoiceNumber: before.invoiceNumber } });
  }

  revalidatePath('/dashboard/invoices');
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
}

// ─── Invoice templates ──────────────────────────────────────────────────────

type TemplateLine = {
  description: string;
  quantity: number;
  cost: number;
  expensePct?: number;
  marginPct?: number;
  unitPrice: number;
};

function normalizeTemplateLines(lines: TemplateLine[]) {
  return lines
    .filter((l) => l.description?.trim())
    .map((l) => ({
      description: l.description.trim(),
      quantity: Number(l.quantity) || 1,
      cost: Number(l.cost) || 0,
      expensePct: l.expensePct != null ? Number(l.expensePct) : DEFAULT_EXPENSE_PCT,
      marginPct: l.marginPct != null ? Number(l.marginPct) : DEFAULT_MARGIN_PCT,
      unitPrice: Number(l.unitPrice) || 0,
    }));
}

export async function listInvoiceTemplates(tenantId: string) {
  return prisma.invoiceTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
}

export async function createInvoiceTemplate(input: {
  name: string;
  currency?: string;
  dueDays?: number;
  isCreditOrDebitNote?: boolean;
  lines: TemplateLine[];
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to manage invoice templates');
  if (!input.name.trim()) throw new Error('Template name is required');

  const template = await prisma.invoiceTemplate.create({
    data: {
      tenantId,
      name: input.name.trim(),
      currency: input.currency || 'USD',
      dueDays: input.dueDays ?? null,
      isCreditOrDebitNote: input.isCreditOrDebitNote ?? false,
      lines: normalizeTemplateLines(input.lines),
    },
  });

  await writeAudit({
    session,
    collection: 'invoice_templates',
    documentId: template.id,
    action: 'create',
    summary: `Created invoice template ${template.name}`,
    after: { name: template.name, currency: template.currency },
  });

  revalidatePath('/dashboard/invoices');
  return template;
}

export async function deleteInvoiceTemplate(templateId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to manage invoice templates');

  const before = await prisma.invoiceTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!before) throw new Error('Template not found');

  await prisma.invoiceTemplate.delete({ where: { id: templateId, tenantId } });

  await writeAudit({
    session,
    collection: 'invoice_templates',
    documentId: templateId,
    action: 'delete',
    summary: `Deleted invoice template ${before.name}`,
    before: { name: before.name },
  });

  revalidatePath('/dashboard/invoices');
}
