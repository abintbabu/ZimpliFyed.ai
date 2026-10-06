'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

export async function listProducts() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'products:read')) throw new Error('You do not have permission to view this');
  return prisma.product.findMany({
    where: { tenantId },
    include: { hsCode: true },
    orderBy: { name: 'asc' },
  });
}

export async function getProduct(productId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'products:read')) throw new Error('You do not have permission to view this');
  return prisma.product.findFirst({
    where: { id: productId, tenantId },
    include: { hsCode: true, priceListItems: { include: { priceList: true } }, variants: { orderBy: { createdAt: 'asc' } } },
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
  input: Partial<{ name: string; description: string; uom: string; category: string; hsCodeId: string | null; active: boolean; specs: Record<string, unknown>;
    lengthCm: number | null; widthCm: number | null; heightCm: number | null; netWeightKg: number | null; grossWeightKg: number | null; piecesPerCarton: number | null; reorderLevel: number | null }>,
) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to update products');

  const before = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!before) throw new Error('Product not found');

  for (const k of ['lengthCm', 'widthCm', 'heightCm', 'netWeightKg', 'grossWeightKg', 'piecesPerCarton', 'reorderLevel'] as const) {
    const v = input[k];
    if (v != null && !(v > 0 || (k === 'reorderLevel' && v === 0))) throw new Error(`${k} must be above 0`);
  }
  if (input.piecesPerCarton != null && !Number.isInteger(input.piecesPerCarton)) throw new Error('Pieces per carton must be a whole number');
  const net = input.netWeightKg ?? before.netWeightKg;
  const gross = input.grossWeightKg ?? before.grossWeightKg;
  if (net != null && gross != null && gross < net) throw new Error('Gross weight cannot be less than net weight');

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

// ── Variants (V2) ────────────────────────────────────────────────────────────

export async function addProductVariant(productId: string, input: { sku: string; name: string; attributes?: Record<string, string>; priceAdjust?: number }) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to edit products');

  const product = await prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true, sku: true } });
  if (!product) throw new Error('Product not found');
  const sku = input.sku.trim();
  const name = input.name.trim();
  if (!sku || !name) throw new Error('A variant needs a SKU and a name');
  if (await prisma.productVariant.findFirst({ where: { productId, sku }, select: { id: true } })) throw new Error(`Variant SKU ${sku} already exists on this product`);

  const attributes = Object.fromEntries(Object.entries(input.attributes ?? {}).map(([k, v]) => [k.trim(), v.trim()]).filter(([k, v]) => k && v));
  const variant = await prisma.productVariant.create({
    data: { productId, sku, name, attributes, priceAdjust: Number.isFinite(input.priceAdjust) ? (input.priceAdjust as number) : 0 },
  });
  await writeAudit({ session, collection: 'products', documentId: productId, action: 'create', summary: `Added variant ${sku} to ${product.sku}`, after: { sku, name } });
  revalidatePath(`/dashboard/products/${productId}`);
  return variant;
}

export async function setProductVariantActive(productId: string, variantId: string, active: boolean) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to edit products');
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
  if (!product) throw new Error('Product not found');
  await prisma.productVariant.updateMany({ where: { id: variantId, productId }, data: { active } });
  revalidatePath(`/dashboard/products/${productId}`);
}
