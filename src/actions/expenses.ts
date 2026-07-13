'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { newStorageKey, putObject } from '@/lib/storage';
import { enqueue } from '@/lib/jobs/queue';

/** Files we accept for an expense snap. A cheap type gate — real AV scanning is a follow-up (no scanner wired).
 * PDFs and common photo formats cover receipts, tax-invoice PDFs, and UPI/bank screenshots. */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — a phone photo or a multi-page invoice PDF, not more

/**
 * Snap an expense (Sprint 4). Uploads the file, creates a pending Expense row, and enqueues the vision
 * pipeline. Returns immediately — extraction runs async on the worker, then flips the row to auto_posted or
 * leaves it in the review queue. The row id doubles as the job idempotency key, so a double-submit can't
 * enqueue the extraction twice.
 */
export async function snapExpenseAction(formData: FormData): Promise<{ expenseId: string }> {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'expenses:write')) throw new Error('You do not have permission to add expenses');

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file was uploaded');
  if (!ALLOWED_MIME.has(file.type)) throw new Error('Upload a photo (JPG/PNG) or a PDF of the receipt');
  if (file.size === 0) throw new Error('The uploaded file is empty');
  if (file.size > MAX_BYTES) throw new Error('File is too large — keep it under 15 MB');

  const orderIdRaw = formData.get('orderId');
  const orderId = typeof orderIdRaw === 'string' && orderIdRaw.length > 0 ? orderIdRaw : null;
  if (orderId) {
    // Never attribute an expense to another tenant's order.
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true } });
    if (!order) throw new Error('Order not found');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = newStorageKey(tenantId, file.name || 'receipt');
  await putObject(key, bytes, file.type);

  const expense = await prisma.expense.create({
    data: {
      tenantId,
      orderId,
      storageKey: key,
      mimeType: file.type,
      status: 'pending_review',
      createdByUserId: userId,
    },
    select: { id: true },
  });

  await enqueue({ tenantId, kind: 'expense.extract', payload: { expenseId: expense.id }, idempotencyKey: expense.id });

  await writeAudit({
    session,
    collection: 'expenses',
    documentId: expense.id,
    action: 'create',
    summary: `Snapped an expense (${file.type}), queued for extraction`,
  });
  revalidatePath('/dashboard/expenses');
  return { expenseId: expense.id };
}

/** Confirm a queued extraction — moves it into the P&L. Optionally correct fields the human edited. */
export async function approveExpenseAction(
  expenseId: string,
  edits?: { amount?: number; vendorName?: string; gstHead?: string; itcEligible?: boolean; orderId?: string | null },
): Promise<void> {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'expenses:write')) throw new Error('You do not have permission to approve expenses');

  const expense = await prisma.expense.findFirst({ where: { id: expenseId, tenantId }, select: { id: true } });
  if (!expense) throw new Error('Expense not found');

  if (edits?.orderId) {
    const order = await prisma.order.findFirst({ where: { id: edits.orderId, tenantId }, select: { id: true } });
    if (!order) throw new Error('Order not found');
  }

  await prisma.expense.update({
    where: { id: expense.id }, // tenant-safe: expenseId verified tenant-owned via findFirst above
    data: {
      status: 'approved',
      reviewedByUserId: userId,
      reviewedAt: new Date(),
      ...(edits?.amount != null ? { amount: edits.amount } : {}),
      ...(edits?.vendorName != null ? { vendorName: edits.vendorName } : {}),
      ...(edits?.gstHead != null ? { gstHead: edits.gstHead } : {}),
      ...(edits?.itcEligible != null ? { itcEligible: edits.itcEligible } : {}),
      ...(edits?.orderId !== undefined ? { orderId: edits.orderId } : {}),
    },
  });
  await writeAudit({ session, collection: 'expenses', documentId: expense.id, action: 'update', summary: 'Approved expense' });
  revalidatePath('/dashboard/expenses');
}

/** Reject a queued extraction (bad scan / not an expense). Kept as a row (not deleted) for the audit trail. */
export async function rejectExpenseAction(expenseId: string): Promise<void> {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'expenses:write')) throw new Error('You do not have permission to reject expenses');

  const expense = await prisma.expense.findFirst({ where: { id: expenseId, tenantId }, select: { id: true } });
  if (!expense) throw new Error('Expense not found');

  await prisma.expense.update({
    where: { id: expense.id }, // tenant-safe: expenseId verified tenant-owned via findFirst above
    data: { status: 'rejected', reviewedByUserId: userId, reviewedAt: new Date() },
  });
  await writeAudit({ session, collection: 'expenses', documentId: expense.id, action: 'update', summary: 'Rejected expense' });
  revalidatePath('/dashboard/expenses');
}
