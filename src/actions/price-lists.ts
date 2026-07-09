'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';

export async function listPriceLists(tenantId: string, buyerId?: string) {
  return prisma.priceList.findMany({
    where: { tenantId, ...(buyerId ? { buyerId } : {}) },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPriceList(tenantId: string, priceListId: string) {
  return prisma.priceList.findFirst({
    where: { id: priceListId, tenantId },
    include: { items: { include: { product: true } } },
  });
}

export async function createPriceList(input: {
  name: string;
  currency?: string;
  buyerId?: string;
  market?: string;
  validFrom?: Date;
  validTo?: Date;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to create price lists');
  if (!input.name.trim()) throw new Error('Name is required');

  const priceList = await prisma.priceList.create({
    data: {
      tenantId,
      name: input.name.trim(),
      currency: input.currency?.trim() || 'USD',
      buyerId: input.buyerId || null,
      market: input.market?.trim() || null,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
    },
  });

  revalidatePath('/dashboard/products');
  if (input.buyerId) revalidatePath(`/dashboard/buyers/${input.buyerId}`);
  return priceList;
}

export async function addPriceListItem(input: { priceListId: string; productId: string; incoterm: string; unitPrice: number; moq?: number }) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to edit price lists');

  const priceList = await prisma.priceList.findFirst({ where: { id: input.priceListId, tenantId } });
  if (!priceList) throw new Error('Price list not found');

  const item = await prisma.priceListItem.create({
    data: {
      priceListId: input.priceListId,
      productId: input.productId,
      incoterm: input.incoterm,
      unitPrice: input.unitPrice,
      moq: input.moq ?? null,
    },
  });

  revalidatePath('/dashboard/products');
  if (priceList.buyerId) revalidatePath(`/dashboard/buyers/${priceList.buyerId}`);
  return item;
}

/** Finds the applicable unit price for a product from the buyer's active price lists (buyer-specific first, then market-wide). */
export async function getPriceForBuyerProduct(buyerId: string, productId: string, incoterm: string) {
  const { tenantId } = await requireTenantSession();
  const item = await prisma.priceListItem.findFirst({
    where: {
      productId,
      incoterm,
      priceList: { tenantId, buyerId },
    },
    orderBy: { priceList: { createdAt: 'desc' } },
  });
  return item?.unitPrice ?? null;
}
