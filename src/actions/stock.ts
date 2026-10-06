'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { balances, validateMovement, lowStock, delta, type MovementKind } from '@/lib/stock';

export async function listStock() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'products:read')) return { items: [], lowCount: 0 };
  const [items, sums] = await Promise.all([
    prisma.stockItem.findMany({ where: { tenantId }, orderBy: [{ name: 'asc' }, { location: 'asc' }] }),
    prisma.stockMovement.groupBy({ by: ['itemId', 'kind'], where: { tenantId }, _sum: { quantity: true } }),
  ]);
  const bal = balances(sums.map((s) => ({ itemId: s.itemId, kind: s.kind as MovementKind, quantity: s._sum.quantity ?? 0 })));
  const low = new Map(lowStock(items, bal).map((l) => [l.itemId, l]));
  return {
    items: items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, location: i.location, uom: i.uom, reorderLevel: i.reorderLevel, onHand: bal.get(i.id) ?? 0, low: low.has(i.id) })),
    lowCount: low.size,
  };
}

export async function createStockItem(input: { sku: string; name: string; location?: string; uom?: string; reorderLevel?: number | null; productId?: string | null }) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to manage stock');
  const sku = input.sku.trim(), name = input.name.trim(), location = input.location?.trim() || 'MAIN';
  if (!sku || !name) throw new Error('A stock item needs a SKU and a name');
  if (input.reorderLevel != null && !(input.reorderLevel >= 0)) throw new Error('Reorder level cannot be negative');
  if (await prisma.stockItem.findFirst({ where: { tenantId, sku, location }, select: { id: true } })) throw new Error(`${sku} already exists at ${location}`);
  if (input.productId && !(await prisma.product.findFirst({ where: { id: input.productId, tenantId }, select: { id: true } }))) throw new Error('Product not found');

  const item = await prisma.stockItem.create({ data: { tenantId, sku, name, location, uom: input.uom?.trim() || 'pcs', reorderLevel: input.reorderLevel ?? null, productId: input.productId || null } });
  await writeAudit({ session, collection: 'stock', documentId: item.id, action: 'create', summary: `Added stock item ${sku} (${location})`, after: { sku, name, location } });
  revalidatePath('/dashboard/stock');
  return item;
}

/** Records a movement; issues cannot overdraw. Balance is always recomputed from movements, never stored. */
export async function recordStockMovement(itemId: string, input: { kind: MovementKind; quantity: number; reason?: string }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'products:write')) throw new Error('You do not have permission to manage stock');

  const item = await prisma.stockItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) throw new Error('Stock item not found');

  // Serialisable so two concurrent issues cannot both pass the overdraw check against the same balance.
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.stockMovement.groupBy({ by: ['kind'], where: { tenantId, itemId }, _sum: { quantity: true } });
    const current = rows.reduce((s, r) => s + delta(r.kind as MovementKind, r._sum.quantity ?? 0), 0);
    const problem = validateMovement(current, input.kind, input.quantity);
    if (problem) throw new Error(problem);
    await tx.stockMovement.create({ data: { tenantId, itemId, kind: input.kind, quantity: input.kind === 'adjustment' ? input.quantity : Math.abs(input.quantity), reason: input.reason?.trim() || null, createdByUserId: userId } });
    return current + delta(input.kind, input.quantity);
  }, { isolationLevel: 'Serializable' });

  await writeAudit({ session, collection: 'stock', documentId: itemId, action: 'update', summary: `${input.kind} ${input.quantity} on ${item.sku} → ${Math.round(result * 1000) / 1000} on hand`, after: { kind: input.kind, quantity: input.quantity } });
  revalidatePath('/dashboard/stock');
  return { onHand: Math.round(result * 1000) / 1000 };
}
