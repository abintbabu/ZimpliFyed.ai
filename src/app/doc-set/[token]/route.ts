import { NextResponse } from 'next/server';
import { getDocSetByShareToken } from '@/actions/doc-sets';
import { renderDocSetHtml } from '@/lib/doc-engine/render';

/**
 * Buyer/CHA-facing, unauthenticated doc-set view (DOC_ENGINE_SPEC §1.4). The share token IS the credential;
 * a revoked or expired token 404s. Returns only the finished, print-ready documents — never the internal rule
 * or AI findings, which stay inside the tenant. Mirrors the /quote/[token] share pattern.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const docSet = await getDocSetByShareToken(token);
  if (!docSet) {
    return new NextResponse('This document link is invalid, revoked, or expired.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const models = docSet.documents.map((d) => d.model);
  return new NextResponse(renderDocSetHtml(models), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
