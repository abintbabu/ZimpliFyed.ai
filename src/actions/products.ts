'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

export async function listProducts(tenantId: string) {
  return prisma.product.findMany({
    where: { tenantId },
    include: { hsCode: true },
    orderBy: { name: 'asc' },
  });
}

export async function getProduct(tenantId: string, productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, tenantId },
    include: { hsCode: true, priceListItems: { include: { priceList: true } } },
  });
}

export async function createProduct(input: {
  sku: string;
  name: string;
  description?: string;
  uom?: string;
  category?: string;
  hsCodeId?: string;
  specs?: Record<string, unknown>;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to create products');
  if (!input.sku.trim() || !input.name.trim()) throw new Error('SKU and name are required');

  const existing = await prisma.product.findFirst({ where: { tenantId, sku: input.sku.trim() } });
  if (existing) throw new Error('A product with this SKU already exists');

  const product = await prisma.product.create({
    data: {
      tenantId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      uom: input.uom?.trim() || 'pcs',
      category: input.category?.trim() || null,
      hsCodeId: input.hsCodeId || null,
      specs: (input.specs as Prisma.InputJsonValue) ?? undefined,
    },
  });

  await writeAudit({
    session,
    collection: 'products',
    documentId: product.id,
    action: 'create',
    summary: `Created product ${product.sku} — ${product.name}`,
    after: { sku: product.sku, name: product.name },
  });

  revalidatePath('/dashboard/products');
  return product;
}

export async function updateProduct(
  productId: string,
  input: Partial<{ name: string; description: string; uom: string; category: string; hsCodeId: string | null; active: boolean; specs: Record<string, unknown> }>,
) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to update products');

  const before = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!before) throw new Error('Product not found');

  await prisma.product.update({
    where: { id: productId, tenantId },
    data: { ...input, specs: (input.specs as Prisma.InputJsonValue) ?? undefined },
  });

  await writeAudit({
    session,
    collection: 'products',
    documentId: productId,
    action: 'update',
    summary: `Updated product ${before.sku}`,
    before,
    after: input,
  });

  revalidatePath('/dashboard/products');
  revalidatePath(`/dashboard/products/${productId}`);
}
