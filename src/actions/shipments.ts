'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { allocateDocNumber } from '@/lib/doc-number-alloc';
import type { FreightQuoteStatus, ShipmentMode, ShipmentStatus } from '@prisma/client';

async function requireWriter() {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'orders:write')) throw new Error('You do not have permission to manage shipments');
  return session;
}

async function ownedShipment(tenantId: string, shipmentId: string) {
  const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, tenantId } });
  if (!shipment) throw new Error('Shipment not found');
  return shipment;
}

const text = (v?: string | null) => v?.trim() || null;

export async function listShipments(tenantId: string) {
  return prisma.shipment.findMany({
    where: { tenantId },
    include: { orders: { include: { order: { select: { id: true, orderNumber: true } } } }, containers: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getShipment(tenantId: string, shipmentId: string) {
  return prisma.shipment.findFirst({
    where: { id: shipmentId, tenantId },
    include: {
      orders: { include: { order: { select: { id: true, orderNumber: true, product: true, destination: true } } } },
      containers: { orderBy: { createdAt: 'asc' } },
      freightQuotes: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function listShipmentsForOrder(tenantId: string, orderId: string) {
  return prisma.shipment.findMany({
    where: { tenantId, orders: { some: { orderId } } },
    select: { id: true, shipmentNumber: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
}

/** Creates a shipment for one or more orders, defaulting ports from the first order. */
export async function createShipment(input: { orderIds: string[]; mode?: ShipmentMode }) {
  const session = await requireWriter();
  const { tenantId } = session;
  if (input.orderIds.length === 0) throw new Error('Pick at least one order');

  const orders = await prisma.order.findMany({ where: { tenantId, id: { in: input.orderIds } } });
  if (orders.length !== new Set(input.orderIds).size) throw new Error('Order not found');
  const first = orders[0];

  const shipmentNumber = await allocateDocNumber(tenantId, 'SHP');
  const shipment = await prisma.shipment.create({
    data: {
      tenantId,
      shipmentNumber,
      mode: input.mode ?? 'sea_fcl',
      originPort: first.originPort,
      destPort: first.destPort,
      orders: { create: orders.map((o) => ({ orderId: o.id })) },
    },
  });

  await writeAudit({
    session,
    collection: 'shipments',
    documentId: shipment.id,
    action: 'create',
    summary: `Created shipment ${shipmentNumber} for ${orders.map((o) => o.orderNumber).join(', ')}`,
  });
  for (const o of orders) revalidatePath(`/dashboard/orders/${o.id}`);
  revalidatePath('/dashboard/shipments');
  return shipment;
}

export async function updateShipment(shipmentId: string, input: {
  mode?: ShipmentMode;
  forwarderName?: string;
  carrier?: string;
  vesselOrFlight?: string;
  bookingNumber?: string;
  originPort?: string;
  destPort?: string;
  etd?: Date | null;
  eta?: Date | null;
  blNumber?: string;
  blDate?: Date | null;
  shippingBillNumber?: string;
  shippingBillDate?: Date | null;
  shippingBillPort?: string;
  notes?: string;
}) {
  const session = await requireWriter();
  const shipment = await ownedShipment(session.tenantId, shipmentId);

  await prisma.shipment.update({
    where: { id: shipment.id, tenantId: session.tenantId },
    data: {
      ...(input.mode ? { mode: input.mode } : {}),
      forwarderName: text(input.forwarderName),
      carrier: text(input.carrier),
      vesselOrFlight: text(input.vesselOrFlight),
      bookingNumber: text(input.bookingNumber),
      originPort: text(input.originPort),
      destPort: text(input.destPort),
      etd: input.etd ?? null,
      eta: input.eta ?? null,
      blNumber: text(input.blNumber),
      blDate: input.blDate ?? null,
      shippingBillNumber: text(input.shippingBillNumber),
      shippingBillDate: input.shippingBillDate ?? null,
      shippingBillPort: text(input.shippingBillPort),
      notes: text(input.notes),
    },
  });
  await writeAudit({ session, collection: 'shipments', documentId: shipment.id, action: 'update', summary: `Updated shipment ${shipment.shipmentNumber}` });
  revalidatePath(`/dashboard/shipments/${shipment.id}`);
}

export async function setShipmentStatus(shipmentId: string, status: ShipmentStatus) {
  const session = await requireWriter();
  const shipment = await ownedShipment(session.tenantId, shipmentId);
  await prisma.shipment.update({ where: { id: shipment.id, tenantId: session.tenantId }, data: { status } });
  await writeAudit({
    session,
    collection: 'shipments',
    documentId: shipment.id,
    action: 'status_change',
    summary: `Shipment ${shipment.shipmentNumber}: ${shipment.status} → ${status}`,
  });
  revalidatePath(`/dashboard/shipments/${shipment.id}`);
  revalidatePath('/dashboard/shipments');
}

export async function addContainer(shipmentId: string, input: {
  containerNumber?: string;
  type?: string;
  sealNumber?: string;
  grossWeightKg?: number | null;
  cbm?: number | null;
}) {
  const session = await requireWriter();
  const shipment = await ownedShipment(session.tenantId, shipmentId);
  await prisma.container.create({
    data: {
      shipmentId: shipment.id,
      containerNumber: text(input.containerNumber),
      type: text(input.type),
      sealNumber: text(input.sealNumber),
      grossWeightKg: input.grossWeightKg ?? null,
      cbm: input.cbm ?? null,
    },
  });
  revalidatePath(`/dashboard/shipments/${shipment.id}`);
}

export async function removeContainer(shipmentId: string, containerId: string) {
  const session = await requireWriter();
  const shipment = await ownedShipment(session.tenantId, shipmentId);
  await prisma.container.deleteMany({ where: { id: containerId, shipmentId: shipment.id } });
  revalidatePath(`/dashboard/shipments/${shipment.id}`);
}

export async function addFreightQuote(shipmentId: string, input: {
  forwarderName: string;
  mode: ShipmentMode;
  currency?: string;
  amount?: number | null;
  transitDays?: number | null;
  validTo?: Date | null;
  notes?: string;
}) {
  const session = await requireWriter();
  const shipment = await ownedShipment(session.tenantId, shipmentId);
  const forwarderName = input.forwarderName.trim();
  if (!forwarderName) throw new Error('Forwarder name is required');

  await prisma.freightQuote.create({
    data: {
      tenantId: session.tenantId,
      shipmentId: shipment.id,
      forwarderName,
      mode: input.mode,
      currency: input.currency?.trim().toUpperCase() || 'USD',
      amount: input.amount ?? null,
      transitDays: input.transitDays ?? null,
      validTo: input.validTo ?? null,
      status: input.amount != null ? 'received' : 'requested',
      notes: text(input.notes),
    },
  });
  revalidatePath(`/dashboard/shipments/${shipment.id}`);
}

/** Accepting a quote rejects its siblings and copies forwarder + mode onto the shipment. */
export async function setFreightQuoteStatus(shipmentId: string, quoteId: string, status: FreightQuoteStatus) {
  const session = await requireWriter();
  const { tenantId } = session;
  const shipment = await ownedShipment(tenantId, shipmentId);
  const quote = await prisma.freightQuote.findFirst({ where: { id: quoteId, tenantId, shipmentId: shipment.id } });
  if (!quote) throw new Error('Freight quote not found');

  await prisma.$transaction(async (tx) => {
    if (status === 'accepted') {
      await tx.freightQuote.updateMany({
        where: { tenantId, shipmentId: shipment.id, id: { not: quote.id }, status: { in: ['requested', 'received', 'accepted'] } },
        data: { status: 'rejected' },
      });
      await tx.shipment.update({ where: { id: shipment.id, tenantId }, data: { forwarderName: quote.forwarderName, mode: quote.mode } });
    }
    await tx.freightQuote.update({ where: { id: quote.id, tenantId }, data: { status } });
  });

  await writeAudit({
    session,
    collection: 'shipments',
    documentId: shipment.id,
    action: 'status_change',
    summary: `Freight quote from ${quote.forwarderName} on ${shipment.shipmentNumber}: ${status}`,
  });
  revalidatePath(`/dashboard/shipments/${shipment.id}`);
}
