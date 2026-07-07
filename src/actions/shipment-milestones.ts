'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { MILESTONE_LABELS } from '@/lib/shipment-milestones';
import type { ShipmentMilestoneType } from '@prisma/client';

export async function listShipmentMilestones(tenantId: string, orderId: string) {
  return prisma.shipmentMilestone.findMany({ where: { tenantId, orderId } });
}

export async function upsertShipmentMilestone(input: {
  orderId: string;
  type: ShipmentMilestoneType;
  plannedAt?: Date | null;
  actualAt?: Date | null;
  notes?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to update shipment milestones');

  const order = await prisma.order.findFirst({ where: { id: input.orderId, tenantId } });
  if (!order) throw new Error('Order not found');

  const milestone = await prisma.shipmentMilestone.upsert({
    where: { orderId_type: { orderId: input.orderId, type: input.type } },
    create: {
      tenantId,
      orderId: input.orderId,
      type: input.type,
      plannedAt: input.plannedAt ?? null,
      actualAt: input.actualAt ?? null,
      notes: input.notes?.trim() || null,
    },
    update: {
      plannedAt: input.plannedAt ?? null,
      actualAt: input.actualAt ?? null,
      notes: input.notes?.trim() || null,
    },
  });

  await writeAudit({
    session,
    collection: 'orders',
    documentId: input.orderId,
    action: 'update',
    summary: `Updated ${MILESTONE_LABELS[input.type]} milestone for order ${order.orderNumber}`,
    after: { type: input.type, plannedAt: milestone.plannedAt, actualAt: milestone.actualAt },
  });

  revalidatePath(`/dashboard/orders/${input.orderId}`);
  return milestone;
}
