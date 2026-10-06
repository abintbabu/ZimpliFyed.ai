'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { validatePackingEntries, summarizePacking } from '@/lib/packing';

type PackingRowInput = {
  orderLineId?: string | null;
  marks?: string | null;
  cartonCount: number;
  qtyPerCarton: number;
  netWeightKg: number;
  grossWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

/** Replaces an order's carton packing data. Totals are derived on read; only per-carton inputs are stored. */
export async function savePackingEntries(orderId: string, rows: PackingRowInput[]) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to edit orders');

  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { lines: true } });
  if (!order) throw new Error('Order not found');
  if (order.status === 'cancelled') throw new Error('A cancelled order cannot be edited');

  validatePackingEntries(rows);

  const lineIds = new Set(order.lines.map((l) => l.id));
  for (const [i, r] of rows.entries()) {
    if (r.orderLineId && !lineIds.has(r.orderLineId)) throw new Error(`Packing row ${i + 1}: that line does not belong to this order`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.packingEntry.deleteMany({ where: { orderId } });
    if (rows.length) {
      await tx.packingEntry.createMany({
        data: rows.map((r, i) => ({
          orderId,
          orderLineId: r.orderLineId || null,
          marks: r.marks?.trim() || null,
          cartonCount: r.cartonCount,
          qtyPerCarton: r.qtyPerCarton,
          netWeightKg: r.netWeightKg,
          grossWeightKg: r.grossWeightKg,
          lengthCm: r.lengthCm,
          widthCm: r.widthCm,
          heightCm: r.heightCm,
          sortOrder: i,
        })),
      });
    }
  });

  const { totals } = summarizePacking(rows);
  await writeAudit({
    session,
    collection: 'orders',
    documentId: orderId,
    action: 'update',
    summary: `Updated packing on ${order.orderNumber}: ${totals.cartons} cartons, ${totals.grossWeightKg} kg gross, ${totals.cbm} CBM`,
    after: totals,
  });

  revalidatePath(`/dashboard/orders/${orderId}`);
  return totals;
}
