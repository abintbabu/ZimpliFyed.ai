'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { billBalance, billStatusFor, validatePayment, type BillStatus } from '@/lib/payables';

export async function listVendorBills() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return [];
  const bills = await prisma.vendorBill.findMany({ where: { tenantId }, include: { vendor: { select: { name: true } }, payments: { orderBy: { paidAt: 'asc' } }, purchaseOrder: { select: { poNumber: true } } }, orderBy: { billDate: 'desc' } });
  return bills.map((b) => ({ ...b, balance: b.status === 'void' ? 0 : billBalance(b.total, b.payments) }));
}

export async function createVendorBill(input: { vendorId: string; billNumber: string; billDate: string; dueDate?: string; currency?: string; total: number; purchaseOrderId?: string; notes?: string }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to record vendor bills');

  const billNumber = input.billNumber.trim();
  if (!billNumber) throw new Error('Enter the supplier’s bill number');
  if (!(input.total > 0)) throw new Error('The bill total must be above 0');
  const currency = (input.currency?.trim() || 'INR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a 3-letter code');
  const billDate = new Date(`${input.billDate}T00:00:00Z`);
  if (Number.isNaN(billDate.getTime())) throw new Error('Bill date is not valid');
  const dueDate = input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) throw new Error('Due date is not valid');
  if (dueDate && dueDate < billDate) throw new Error('The due date is before the bill date');

  const vendor = await prisma.vendor.findFirst({ where: { id: input.vendorId, tenantId }, select: { id: true, name: true } });
  if (!vendor) throw new Error('Vendor not found');
  if (input.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, tenantId }, select: { vendorId: true } });
    if (!po) throw new Error('Purchase order not found');
    if (po.vendorId !== vendor.id) throw new Error('That purchase order belongs to a different vendor');
  }
  if (await prisma.vendorBill.findFirst({ where: { tenantId, vendorId: vendor.id, billNumber }, select: { id: true } })) throw new Error(`${vendor.name} bill ${billNumber} is already recorded`);

  const bill = await prisma.vendorBill.create({ data: { tenantId, vendorId: vendor.id, billNumber, billDate, dueDate, currency, total: input.total, purchaseOrderId: input.purchaseOrderId || null, notes: input.notes?.trim() || null, createdByUserId: userId } });
  await writeAudit({ session, collection: 'vendor_bills', documentId: bill.id, action: 'create', summary: `Recorded bill ${billNumber} from ${vendor.name} for ${currency} ${input.total}`, after: { billNumber, total: input.total, currency } });
  revalidatePath('/dashboard/payables');
  return bill;
}

/** Records a payment; the bill's status is re-derived from its payments inside the same transaction. */
export async function recordVendorPayment(billId: string, input: { amount: number; paidAt: string; mode?: string; reference?: string; notes?: string }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to record payments');
  const paidAt = new Date(`${input.paidAt}T00:00:00Z`);
  if (Number.isNaN(paidAt.getTime())) throw new Error('Payment date is not valid');
  if (paidAt.getTime() > Date.now() + 86_400_000) throw new Error('A payment cannot be dated in the future');

  const result = await prisma.$transaction(async (tx) => {
    const bill = await tx.vendorBill.findFirst({ where: { id: billId, tenantId }, include: { payments: true, vendor: { select: { name: true } } } });
    if (!bill) throw new Error('Bill not found');
    const problem = validatePayment(bill.total, bill.payments, input.amount, bill.status as BillStatus);
    if (problem) throw new Error(problem);
    const payment = await tx.vendorPayment.create({ data: { tenantId, billId, amount: input.amount, paidAt, mode: input.mode?.trim() || null, reference: input.reference?.trim() || null, notes: input.notes?.trim() || null, createdByUserId: userId } });
    const status = billStatusFor(bill.total, [...bill.payments, { amount: input.amount }]);
    await tx.vendorBill.update({ where: { id: billId, tenantId }, data: { status } });
    return { bill, payment, status };
  }, { isolationLevel: 'Serializable' });

  await writeAudit({ session, collection: 'vendor_bills', documentId: billId, action: 'mark_paid', summary: `Paid ${input.amount} on bill ${result.bill.billNumber} (${result.bill.vendor.name}) → ${result.status}`, after: { amount: input.amount, status: result.status } });
  revalidatePath('/dashboard/payables');
  return { status: result.status };
}

export async function voidVendorBill(billId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to void bills');
  const bill = await prisma.vendorBill.findFirst({ where: { id: billId, tenantId }, include: { payments: true } });
  if (!bill) throw new Error('Bill not found');
  if (bill.payments.length > 0) throw new Error('A bill with payments cannot be voided — it has already been paid in part');
  await prisma.vendorBill.update({ where: { id: billId, tenantId }, data: { status: 'void' } });
  await writeAudit({ session, collection: 'vendor_bills', documentId: billId, action: 'status_change', summary: `Voided bill ${bill.billNumber}`, before: { status: bill.status }, after: { status: 'void' } });
  revalidatePath('/dashboard/payables');
}
