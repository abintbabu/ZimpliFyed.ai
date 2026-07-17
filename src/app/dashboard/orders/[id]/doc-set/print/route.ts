import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getOrderDocSet } from '@/actions/doc-sets';
import { renderDocSetHtml } from '@/lib/doc-engine/render';

/**
 * Print-ready view of an order's latest doc-set (DOC_ENGINE_SPEC §1.2). Returns one self-contained HTML page
 * per document, each on its own A4 sheet — the user prints to PDF from the browser. This is the interim of the
 * spec's `@react-pdf/renderer` swap: same DocModel input, so the connector drops in without touching this route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const docSet = await getOrderDocSet(id);
  if (!docSet) return NextResponse.json({ error: 'No documents generated for this order yet' }, { status: 404 });

  const models = docSet.documents.map((d) => d.model).filter((m): m is NonNullable<typeof m> => m !== null);
  if (models.length === 0) return NextResponse.json({ error: 'This doc-set has no rendered documents' }, { status: 404 });

  return new NextResponse(renderDocSetHtml(models), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
