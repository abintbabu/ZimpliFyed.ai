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
};

function requireCollectionWriteAccess(collection: string, role: Parameters<typeof hasPermission>[0]) {
  const permission = COLLECTION_WRITE_PERMISSION[collection];
  if (!permission || !hasPermission(role, permission)) {
    throw new Error('You do not have permission to manage documents here');
  }
}

export async function listDocuments(collection: string, documentId: string) {
  const { tenantId } = await requireTenantSession();
  return prisma.document.findMany({
    where: { tenantId, collection, documentId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getDocumentDownloadUrl(documentId: string) {
  const session = await requireTenantSession();
  const { tenantId } = session;
  const doc = await prisma.document.findFirst({ where: { id: documentId, tenantId } });
  if (!doc) throw new Error('Document not found');

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

  revalidatePath(`/dashboard/${collection}/${documentId}`);
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

  revalidatePath(`/dashboard/${doc.collection}/${doc.documentId}`);
}
