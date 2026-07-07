'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';

function generateToken() {
  return randomBytes(16).toString('hex');
}

export async function createBuyerTrackLink(orderId: string) {
  const { tenantId, userId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to share this order');

  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
  if (!order) throw new Error('Order not found');

  const track = await prisma.orderBuyerTrack.create({
    data: { orderId, token: generateToken(), createdByUserId: userId },
  });

  revalidatePath(`/dashboard/orders/${orderId}`);
  return track;
}

export async function refreshBuyerTrackLink(trackId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to share this order');

  const track = await prisma.orderBuyerTrack.findUnique({ where: { id: trackId }, include: { order: true } });
  if (!track || track.order.tenantId !== tenantId) throw new Error('Track link not found');

  const updated = await prisma.orderBuyerTrack.update({ where: { id: trackId }, data: { token: generateToken() } });
  revalidatePath(`/dashboard/orders/${track.orderId}`);
  return updated;
}

export async function revokeBuyerTrackLink(trackId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to share this order');

  const track = await prisma.orderBuyerTrack.findUnique({ where: { id: trackId }, include: { order: true } });
  if (!track || track.order.tenantId !== tenantId) throw new Error('Track link not found');

  await prisma.orderBuyerTrack.update({ where: { id: trackId }, data: { active: false } });
  revalidatePath(`/dashboard/orders/${track.orderId}`);
}

/** Buyer-facing, unauthenticated. Only returns a stripped-down view — no vendor cost/banking data. */
export async function getBuyerTrackByToken(token: string) {
  const track = await prisma.orderBuyerTrack.findUnique({
    where: { token },
    include: { order: { include: { shipmentMilestones: true } } },
  });
  if (!track || !track.active) return null;

  const { order } = track;
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    product: order.product,
    quantity: order.quantity,
    unit: order.unit,
    incoterm: order.incoterm,
    destination: order.destination,
    originPort: order.originPort,
    destPort: order.destPort,
    milestones: order.shipmentMilestones.map((m) => ({ type: m.type, plannedAt: m.plannedAt, actualAt: m.actualAt })),
  };
}
