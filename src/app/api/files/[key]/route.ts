import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { getObject } from '@/lib/storage';

/** Local-disk dev fallback for file downloads (S3/R2 serves via presigned URLs directly). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const storageKey = decodeURIComponent(key);

  const { tenantId } = await requireTenantSession();
  const doc = await prisma.document.findFirst({ where: { tenantId, storageKey } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await getObject(storageKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${doc.fileName}"`,
    },
  });
}
