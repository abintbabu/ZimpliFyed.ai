import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getOrderDocSet } from '@/actions/doc-sets';
import { prisma } from '@/lib/prisma';
import { renderDocSetHtml } from '@/lib/doc-engine/render';
import { renderDocSetPdf } from '@/lib/doc-engine/pdf';

/**
 * Print-ready view of an order's latest doc-set (DOC_ENGINE_SPEC §1.2).
 *
 * `?format=pdf` returns real PDF bytes from `pdf.tsx`; the default returns one self-contained A4 HTML page
 * per document for browser print. Both read the same DocModels, so the two outputs carry identical content.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format');
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const docSet = await getOrderDocSet(id);
  if (!docSet) return NextResponse.json({ error: 'No documents generated for this order yet' }, { status: 404 });

  const models = docSet.documents.map((d) => d.model).filter((m): m is NonNullable<typeof m> => m !== null);
  if (models.length === 0) return NextResponse.json({ error: 'This doc-set has no rendered documents' }, { status: 404 });

  if (format === 'pdf') {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { primaryColor: true } });
    const bytes = await renderDocSetPdf(models, { accent: tenant?.primaryColor });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        // `inline` so the browser's own viewer opens it; the filename still applies on save.
        'Content-Disposition': `inline; filename="doc-set-${id}.pdf"`,
      },
    });
  }

  return new NextResponse(renderDocSetHtml(models), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
