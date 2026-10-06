'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { extractShippingDoc } from '@/lib/ai/shipping-extract';
import { checkContainerNumber } from '@/lib/container-number';

export type ShipmentProposal = {
  fields: { blNumber: string | null; bookingNumber: string | null; vesselOrFlight: string | null; forwarderName: string | null; originPort: string | null; destPort: string | null; etd: string | null; eta: string | null };
  containers: { containerNumber: string; sealNumber: string | null; type: string | null; valid: boolean; problem: string | null; duplicate: boolean }[];
};

/**
 * Reads a forwarder's inbox message into proposed shipment particulars. Container numbers are re-validated
 * deterministically (ISO 6346 check digit) — the model's transcription is never trusted — and flagged if they
 * already sit on the shipment. Nothing is saved here.
 */
export async function proposeShipmentFromMessage(messageId: string, shipmentId: string): Promise<{ proposal: ShipmentProposal } | { unavailable: string }> {
  const { tenantId, role, userId } = await requireTenantSession();
  if (!hasPermission(role, 'orders:write') || !hasPermission(role, 'inbox:read')) return { unavailable: 'You do not have permission to do this.' };

  const [message, shipment] = await Promise.all([
    prisma.inboxMessage.findFirst({ where: { id: messageId, tenantId }, select: { subject: true, body: true } }),
    prisma.shipment.findFirst({ where: { id: shipmentId, tenantId }, include: { containers: { select: { containerNumber: true } } } }),
  ]);
  if (!message) return { unavailable: 'Message not found.' };
  if (!shipment) return { unavailable: 'Shipment not found.' };

  const { doc } = await extractShippingDoc(`${message.subject ?? ''}\n\n${message.body}`.slice(0, 20_000), tenantId, userId);
  const existing = new Set(shipment.containers.map((c) => c.containerNumber?.toUpperCase().replace(/[\s-]/g, '')).filter(Boolean));

  return {
    proposal: {
      fields: { blNumber: doc.blNumber, bookingNumber: doc.bookingNumber, vesselOrFlight: doc.vesselOrFlight, forwarderName: doc.forwarderName, originPort: doc.originPort, destPort: doc.destPort, etd: doc.etd, eta: doc.eta },
      containers: doc.containers.map((c) => {
        const chk = checkContainerNumber(c.containerNumber);
        return { containerNumber: chk.ok ? chk.number : c.containerNumber.trim(), sealNumber: c.sealNumber, type: c.type, valid: chk.ok, problem: chk.ok ? null : chk.reason, duplicate: chk.ok && existing.has(chk.number) };
      }),
    },
  };
}

const FIELD_KEYS = ['blNumber', 'bookingNumber', 'vesselOrFlight', 'forwarderName', 'originPort', 'destPort', 'etd', 'eta'] as const;

/** Applies ONLY the ticked fields and valid, non-duplicate containers. Anything not ticked is left exactly as it was. */
export async function applyShipmentProposal(shipmentId: string, input: { fields: Partial<ShipmentProposal['fields']>; containers: { containerNumber: string; sealNumber?: string | null; type?: string | null }[] }) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to manage shipments');
  const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, tenantId }, include: { containers: { select: { containerNumber: true } } } });
  if (!shipment) throw new Error('Shipment not found');

  const data: Record<string, string | Date> = {};
  for (const k of FIELD_KEYS) {
    const v = input.fields[k];
    if (v == null || v === '') continue;
    if (k === 'etd' || k === 'eta') {
      const d = new Date(`${v}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime())) throw new Error(`${k.toUpperCase()} is not a valid date`);
      data[k] = d;
    } else data[k] = String(v).trim().slice(0, 200);
  }

  const have = new Set(shipment.containers.map((c) => c.containerNumber?.toUpperCase().replace(/[\s-]/g, '')).filter(Boolean));
  const toAdd: { containerNumber: string; sealNumber: string | null; type: string | null }[] = [];
  for (const c of input.containers) {
    const chk = checkContainerNumber(c.containerNumber);
    if (!chk.ok) throw new Error(`${c.containerNumber}: ${chk.reason}`);
    if (have.has(chk.number)) continue;
    have.add(chk.number);
    toAdd.push({ containerNumber: chk.number, sealNumber: c.sealNumber?.trim() || null, type: c.type?.trim() || null });
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.shipment.update({ where: { id: shipmentId, tenantId }, data });
    if (toAdd.length) await tx.container.createMany({ data: toAdd.map((c) => ({ shipmentId, ...c })) });
  });
  await writeAudit({ session, collection: 'shipments', documentId: shipmentId, action: 'update', summary: `Applied forwarder details to ${shipment.shipmentNumber}: ${Object.keys(data).join(', ') || 'no fields'}${toAdd.length ? `, ${toAdd.length} container(s)` : ''}`, after: { fields: Object.keys(data), containers: toAdd.map((c) => c.containerNumber) } });
  revalidatePath(`/dashboard/shipments/${shipmentId}`);
  return { fields: Object.keys(data).length, containers: toAdd.length };
}
