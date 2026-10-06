'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';

const text = (v?: string | null) => v?.trim() || null;

export async function listForwarders() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return [];
  const rows = await prisma.forwarder.findMany({
    where: { tenantId },
    include: { freightQuotes: { select: { status: true, transitDays: true, amount: true } } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  return rows.map((f) => {
    const transit = f.freightQuotes.map((q) => q.transitDays).filter((n): n is number => n != null);
    return {
      id: f.id, name: f.name, contactName: f.contactName, email: f.email, phone: f.phone, notes: f.notes, active: f.active,
      quotes: f.freightQuotes.length,
      accepted: f.freightQuotes.filter((q) => q.status === 'accepted').length,
      avgTransitDays: transit.length ? Math.round((transit.reduce((s, n) => s + n, 0) / transit.length) * 10) / 10 : null,
    };
  });
}

export async function createForwarder(input: { name: string; contactName?: string; email?: string; phone?: string; notes?: string }) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to manage forwarders');
  const name = input.name.trim();
  if (!name) throw new Error('Forwarder name is required');
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) throw new Error('That email address is not valid');
  if (await prisma.forwarder.findFirst({ where: { tenantId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw new Error(`${name} is already in your forwarders`);

  const f = await prisma.forwarder.create({ data: { tenantId, name, contactName: text(input.contactName), email: text(input.email), phone: text(input.phone), notes: text(input.notes) } });
  await writeAudit({ session, collection: 'forwarders', documentId: f.id, action: 'create', summary: `Added forwarder ${name}`, after: { name } });
  revalidatePath('/dashboard/forwarders');
  return f;
}

export async function setForwarderActive(forwarderId: string, active: boolean) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to manage forwarders');
  const res = await prisma.forwarder.updateMany({ where: { id: forwarderId, tenantId }, data: { active } });
  if (res.count === 0) throw new Error('Forwarder not found');
  revalidatePath('/dashboard/forwarders');
}
