'use server';

import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { buildTenantExportZip } from '@/lib/data-export';
import { newStorageKey, putObject, getDownloadUrl } from '@/lib/storage';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { writeDomainEvent } from '@/lib/domain-events';

const EXPORT_URL_TTL_SEC = 24 * 60 * 60;

/** Owner-only data export (BILLING_SPEC §4). Rate-limited to 1/day per tenant; builds the zip synchronously
 * (small enough for now — revisit with a background job if export time becomes a problem at scale) and returns
 * a 24h signed download link. Email delivery of the link is a follow-up (no email provider wired yet). */
export async function requestDataExport(): Promise<{ url: string; expiresAt: string }> {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'users:manage')) throw new Error('Only owners and admins can request a data export');

  const rl = await checkRateLimitDb(`data-export:${session.tenantId}`, 1, 24 * 60 * 60 * 1000);
  if (!rl.allowed) {
    throw new Error(`You can request one export per day. Try again in ${Math.ceil(rl.retryAfterSec / 3600)}h.`);
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });

  const zipBuffer = await buildTenantExportZip(session.tenantId);
  const fileName = `export-${new Date().toISOString().slice(0, 10)}.zip`;
  const key = newStorageKey(session.tenantId, fileName);
  await putObject(key, zipBuffer, 'application/zip');
  const url = await getDownloadUrl(key, EXPORT_URL_TTL_SEC);

  // Document row so the local-disk dev fallback (/api/files/[key]) can authorize the download the same way it
  // does for every other stored file — S3/R2 in production serves straight off the presigned URL instead.
  await prisma.document.create({
    data: {
      tenantId: session.tenantId,
      collection: 'data_exports',
      documentId: session.tenantId,
      fileName,
      mimeType: 'application/zip',
      size: zipBuffer.byteLength,
      storageKey: key,
      uploadedByUserId: session.userId,
      uploadedByEmail: user?.email ?? 'unknown',
    },
  });

  await prisma.meterEvent.create({ data: { tenantId: session.tenantId, kind: 'data_export', metadata: { key } } });
  await writeDomainEvent(prisma, { tenantId: session.tenantId, type: 'data_export.requested', refId: key });

  return { url, expiresAt: new Date(Date.now() + EXPORT_URL_TTL_SEC * 1000).toISOString() };
}
