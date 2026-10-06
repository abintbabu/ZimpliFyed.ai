'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission, type Permission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { newStorageKey, putObject, getDownloadUrl, deleteObject } from '@/lib/storage';
import { auth } from '@/auth';

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// Which write permission is required to attach/remove a document, per collection.
const COLLECTION_WRITE_PERMISSION: Record<string, Permission> = {
  orders: 'orders:write',
  quotes: 'quotes:write',
  invoices: 'invoices:write',
  vendors: 'vendors:write',
  buyers: 'customers:write',
  shipments: 'orders:write',
  compliance_items: 'compliance:write',
  products: 'products:write',
};

/**
 * Read counterpart to COLLECTION_WRITE_PERMISSION. Listing a record's attachments and minting a
 * signed download URL both disclose the document — a stored LC, invoice or compliance certificate —
 * so they need the read permission for the collection they belong to, not just a tenant session.
 * Without this, any member could enumerate and download every tenant document via the action's
 * own POST endpoint regardless of role.
 */
const COLLECTION_READ_PERMISSION: Record<string, Permission> = {
  orders: 'orders:read',
  quotes: 'quotes:read',
  invoices: 'invoices:read',
  vendors: 'vendors:read',
  buyers: 'customers:read',
  shipments: 'orders:read',
  compliance_items: 'compliance:read',
  products: 'products:read',
};

/** Where each collection's detail page lives, for cache revalidation after an upload. */
const COLLECTION_PATH: Record<string, (id: string) => string> = {
  orders: (id) => `/dashboard/orders/${id}`,
  quotes: (id) => `/dashboard/quotes/${id}`,
  invoices: (id) => `/dashboard/invoices/${id}`,
  vendors: (id) => `/dashboard/vendors/${id}`,
  buyers: (id) => `/dashboard/buyers/${id}`,
  shipments: (id) => `/dashboard/shipments/${id}`,
  compliance_items: () => '/dashboard/compliance',
  products: (id) => `/dashboard/products/${id}`,
};

/** A document may only be attached to a record that exists in the caller's own tenant. */
async function assertTargetOwned(collection: string, documentId: string, tenantId: string) {
  const found =
    collection === 'orders' ? await prisma.order.findFirst({ where: { id: documentId, tenantId }, select: { id: true } })
    : collection === 'quotes' ? await prisma.quote.findFirst({ where: { id: documentId, tenantId }, select: { id: true } })
    : collection === 'invoices' ? await prisma.invoice.findFirst({ where: { id: documentId, tenantId }, select: { id: true } })
    : collection === 'vendors' ? await prisma.vendor.findFirst({ where: { id: documentId, tenantId }, select: { id: true } })
    : collection === 'buyers' ? await prisma.buyer.findFirst({ where: { id: documentId, tenantId }, select: { id: true } })
    : collection === 'shipments' ? await prisma.shipment.findFirst({ where: { id: documentId, tenantId }, select: { id: true } })
    : collection === 'products' ? await prisma.product.findFirst({ where: { id: documentId, tenantId }, select: { id: true } })
    : collection === 'compliance_items' ? await prisma.complianceItem.findFirst({ where: { id: documentId, tenantId }, select: { id: true } })
    : null;
  if (!found) throw new Error('That record was not found');
}

function requireCollectionWriteAccess(collection: string, role: Parameters<typeof hasPermission>[0]) {
  const permission = COLLECTION_WRITE_PERMISSION[collection];
  if (!permission || !hasPermission(role, permission)) {
    throw new Error('You do not have permission to manage documents here');
  }
}

function requireCollectionReadAccess(collection: string, role: Parameters<typeof hasPermission>[0]) {
  const permission = COLLECTION_READ_PERMISSION[collection];
  if (!permission || !hasPermission(role, permission)) {
    throw new Error('You do not have permission to view documents here');
  }
}

export async function listDocuments(collection: string, documentId: string) {
  const { tenantId, role } = await requireTenantSession();
  requireCollectionReadAccess(collection, role);
  return prisma.document.findMany({
    where: { tenantId, collection, documentId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getDocumentDownloadUrl(documentId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  const doc = await prisma.document.findFirst({ where: { id: documentId, tenantId } });
  if (!doc) throw new Error('Document not found');
  // Checked against the document's own collection, not a caller-supplied one.
  requireCollectionReadAccess(doc.collection, role);

  await writeAudit({
    session,
    collection: doc.collection,
    documentId: doc.documentId,
    action: 'download',
    summary: `Downloaded ${doc.fileName}`,
  });

  return getDownloadUrl(doc.storageKey);
}

export async function uploadDocument(collection: string, documentId: string, formData: FormData) {
  const session = await requireTenantSession();
  const { tenantId, userId, role } = session;
  requireCollectionWriteAccess(collection, role);
  await assertTargetOwned(collection, documentId, tenantId);

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided');
  if (file.size === 0) throw new Error('File is empty');
  if (file.size > MAX_SIZE_BYTES) throw new Error('File exceeds the 20MB limit');

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = newStorageKey(tenantId, file.name);
  await putObject(storageKey, buffer, file.type || 'application/octet-stream');

  const authSession = await auth();
  const doc = await prisma.document.create({
    data: {
      tenantId,
      collection,
      documentId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      storageKey,
      uploadedByUserId: userId,
      uploadedByEmail: authSession?.user?.email ?? 'unknown',
    },
  });

  await writeAudit({
    session,
    collection,
    documentId,
    action: 'upload',
    summary: `Uploaded ${file.name}`,
    after: { fileName: file.name, size: file.size },
  });

  revalidatePath(COLLECTION_PATH[collection]?.(documentId) ?? '/dashboard');
  return doc;
}

export async function deleteDocument(documentId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;

  const doc = await prisma.document.findFirst({ where: { id: documentId, tenantId } });
  if (!doc) throw new Error('Document not found');
  requireCollectionWriteAccess(doc.collection, role);

  await deleteObject(doc.storageKey);
  await prisma.document.delete({ where: { id: documentId, tenantId } });

  await writeAudit({
    session,
    collection: doc.collection,
    documentId: doc.documentId,
    action: 'delete',
    summary: `Deleted document ${doc.fileName}`,
    before: { fileName: doc.fileName },
  });

  revalidatePath(COLLECTION_PATH[doc.collection]?.(doc.documentId) ?? '/dashboard');
}
