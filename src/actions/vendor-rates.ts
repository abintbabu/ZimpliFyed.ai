'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import type { VendorRateMethod } from '@prisma/client';

export async function listVendorRates(tenantId: string) {
  return prisma.vendorRate.findMany({ where: { tenantId }, include: { tiers: true, vendor: true } });
}

export async function listVendorRatesByVendor(tenantId: string, vendorId: string) {
  return prisma.vendorRate.findMany({
    where: { tenantId, vendorId },
    include: { tiers: true },
    orderBy: { sku: 'asc' },
  });
}

export async function createVendorRate(input: {
  vendorId: string;
  sku: string;
  description?: string;
  method: VendorRateMethod;
  baseRate: number;
  normalizedPieceCost?: number;
  moqPieces?: number;
  leadTimeDays?: number;
  tiers?: { minQty: number; rate: number }[];
}) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to add vendor rates');
  if (!input.sku.trim()) throw new Error('SKU/description is required');

  const rate = await prisma.vendorRate.create({
    data: {
      tenantId,
      vendorId: input.vendorId,
      sku: input.sku.trim(),
      description: input.description?.trim() || null,
      method: input.method,
      baseRate: input.baseRate,
      normalizedPieceCost: input.normalizedPieceCost ?? null,
      moqPieces: input.moqPieces ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      tiers: input.tiers?.length ? { create: input.tiers } : undefined,
    },
  });

  revalidatePath(`/dashboard/vendors/${input.vendorId}`);
  return rate;
}

export async function updateVendorRate(
  rateId: string,
  input: Partial<{
    sku: string;
    description: string;
    method: VendorRateMethod;
    baseRate: number;
    normalizedPieceCost: number;
    moqPieces: number;
    leadTimeDays: number;
  }>,
) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to update vendor rates');

  const rate = await prisma.vendorRate.update({ where: { id: rateId, tenantId }, data: input });
  revalidatePath(`/dashboard/vendors/${rate.vendorId}`);
  return rate;
}

export async function deleteVendorRate(rateId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to delete vendor rates');

  const rate = await prisma.vendorRate.delete({ where: { id: rateId, tenantId } });
  revalidatePath(`/dashboard/vendors/${rate.vendorId}`);
}

export async function setPreferredVendorRate(rateId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to update vendor rates');

  const rate = await prisma.vendorRate.findFirst({ where: { id: rateId, tenantId } });
  if (!rate) throw new Error('Vendor rate not found');

  await prisma.$transaction([
    prisma.vendorRate.updateMany({
      where: { tenantId, sku: rate.sku, isPreferred: true },
      data: { isPreferred: false },
    }),
    prisma.vendorRate.update({ where: { id: rateId }, data: { isPreferred: true } }),
  ]);

  revalidatePath(`/dashboard/vendors/${rate.vendorId}`);
}
