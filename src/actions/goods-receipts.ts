'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { allocateDocNumber } from '@/lib/doc-number-alloc';
import { canTransitionPo } from '@/lib/purchase-order';
import { validateReceipt, poReceiptProgress, type ReceiptLineInput } from '@/lib/goods-receipt';
import { buildScorecard } from '@/lib/scorecard';

export async function listGoodsReceipts(poId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return [];
  return prisma.goodsReceipt.findMany({ where: { tenantId, purchaseOrderId: poId }, include: { lines: true }, orderBy: { receivedAt: 'asc' } });
}

/**
 * Records a delivery against a PO (partial deliveries allowed). When the cumulative received quantity covers
 * every line the PO becomes `received` and stamps `receivedAt` — that date is what the supplier scorecard
 * measures lateness against. Optionally books accepted quantities into stock (lines with a SKU only).
 */
export async function createGoodsReceipt(poId: string, input: { receivedAt?: string; notes?: string; addToStock?: boolean; lines: ReceiptLineInput[] }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to record goods receipts');

  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, tenantId }, include: { lines: true, receipts: { include: { lines: true } } } });
  if (!po) throw new Error('Purchase order not found');
  if (!['issued', 'acknowledged'].includes(po.status)) throw new Error(`A ${po.status} purchase order cannot receive goods — issue it first`);

  const problem = validateReceipt(input.lines, po.lines);
  if (problem) throw new Error(problem);

  const receivedAt = input.receivedAt ? new Date(`${input.receivedAt}T00:00:00Z`) : new Date();
  if (Number.isNaN(receivedAt.getTime())) throw new Error('Received date is not valid');
  if (receivedAt.getTime() > Date.now() + 86_400_000) throw new Error('A receipt cannot be dated in the future');

  const live = input.lines.filter((l) => l.qtyReceived > 0 || l.qtyRejected > 0);
  const priorLines = po.receipts.map((r) => r.lines.map((l) => ({ poLineId: l.poLineId, description: l.description, qtyReceived: l.qtyReceived, qtyRejected: l.qtyRejected })));
  const progress = poReceiptProgress(po.lines, [...priorLines, live]);
  const receiptNumber = await allocateDocNumber(tenantId, 'GRN');

  let stocked = 0;
  const skippedStock: string[] = [];
  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.goodsReceipt.create({
      data: {
        tenantId, purchaseOrderId: poId, receiptNumber, receivedAt, notes: input.notes?.trim() || null, createdByUserId: userId,
        lines: { create: live.map((l) => ({ poLineId: l.poLineId, description: l.description, qtyReceived: l.qtyReceived, qtyRejected: l.qtyRejected, rejectReason: l.rejectReason?.trim() || null })) },
      },
    });

    if (input.addToStock) {
      for (const l of live) {
        const accepted = l.qtyReceived - l.qtyRejected;
        const poLine = po.lines.find((p) => p.id === l.poLineId);
        if (accepted <= 0) continue;
        if (!poLine?.sku) { skippedStock.push(l.description); continue; }
        let item = await tx.stockItem.findFirst({ where: { tenantId, sku: poLine.sku, location: 'MAIN' } });
        if (!item) item = await tx.stockItem.create({ data: { tenantId, sku: poLine.sku, name: poLine.description, uom: poLine.uom ?? 'pcs' } });
        await tx.stockMovement.create({ data: { tenantId, itemId: item.id, kind: 'receipt', quantity: accepted, reason: `Received on ${receiptNumber}`, refType: 'goods_receipt', refId: created.id, createdByUserId: userId } });
        stocked += 1;
      }
    }

    if (progress.complete && canTransitionPo(po.status, 'received')) {
      await tx.purchaseOrder.update({ where: { id: poId, tenantId }, data: { status: 'received', receivedAt } });
    }
    return created;
  });

  await writeAudit({ session, collection: 'purchase_orders', documentId: poId, action: 'update', summary: `${receiptNumber} recorded on ${po.poNumber}${progress.complete ? ' — PO fully received' : ' (partial)'}`, after: { receiptNumber, complete: progress.complete } });
  revalidatePath(`/dashboard/purchase-orders/${poId}`);
  revalidatePath('/dashboard/purchase-orders');
  revalidatePath('/dashboard/stock');
  return { receipt, complete: progress.complete, stocked, skippedStock };
}

/** Supplier performance from this vendor's POs and receipts. */
export async function getVendorScorecard(vendorId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return null;
  const pos = await prisma.purchaseOrder.findMany({ where: { tenantId, vendorId }, include: { lines: true, receipts: { include: { lines: true } } } });
  return buildScorecard(
    pos.map((p) => ({ poNumber: p.poNumber, createdAt: p.createdAt, deliveryDate: p.deliveryDate, receivedAt: p.receivedAt, status: p.status, lines: p.lines })),
    pos.flatMap((p) => p.receipts.flatMap((r) => r.lines)),
  );
}
