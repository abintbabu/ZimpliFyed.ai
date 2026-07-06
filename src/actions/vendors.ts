'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';

export async function listVendors(tenantId: string) {
  return prisma.vendor.findMany({
    where: { tenantId },
    include: { rates: { include: { tiers: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getVendor(tenantId: string, vendorId: string) {
  return prisma.vendor.findFirst({
    where: { id: vendorId, tenantId },
    include: { rates: { include: { tiers: true } } },
  });
}

export async function createVendor(input: {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  bankDetails?: string;
}) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to create vendors');
  if (!input.name.trim()) throw new Error('Name is required');

  const vendor = await prisma.vendor.create({
    data: {
      tenantId,
      name: input.name.trim(),
      contactName: input.contactName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      bankDetails: input.bankDetails?.trim() || null,
    },
  });

  revalidatePath('/dashboard/vendors');
  return vendor;
}

export async function updateVendor(
  vendorId: string,
  input: Partial<{ name: string; contactName: string; email: string; phone: string; bankDetails: string }>,
) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to update vendors');

  await prisma.vendor.update({ where: { id: vendorId, tenantId }, data: input });
  revalidatePath('/dashboard/vendors');
  revalidatePath(`/dashboard/vendors/${vendorId}`);
}

export async function deleteVendor(vendorId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to delete vendors');

  await prisma.vendor.delete({ where: { id: vendorId, tenantId } });
  revalidatePath('/dashboard/vendors');
}
