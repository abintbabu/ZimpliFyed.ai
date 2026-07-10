'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { classifyHsCode } from '@/lib/ai/hs-classification';

export async function listHsCodes(tenantId: string) {
  return prisma.hsCode.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 });
}

export async function lookupHsCode(description: string) {
  const session = await requireTenantSession();
  const { tenantId } = session;
  if (!hasPermission(session.role, 'hs_codes:write')) {
    throw new Error('You do not have permission to look up HS codes');
  }
  const trimmed = description.trim();
  if (!trimmed) throw new Error('Enter a product description first');

  const cached = await prisma.hsCode.findFirst({ where: { tenantId, description: trimmed } });
  if (cached) return { ...cached, interactionId: null as string | null };

  const { classification, interactionId } = await classifyHsCode(trimmed, tenantId, session.userId);

  const hsCode = await prisma.hsCode.create({
    data: {
      tenantId,
      description: trimmed,
      hsCode: classification.hsCode,
      dutyRatePct: classification.dutyRatePct,
      rodtepRatePct: classification.rodtepRatePct,
      rationale: classification.rationale,
    },
  });

  await writeAudit({
    session,
    collection: 'hs_codes',
    documentId: hsCode.id,
    action: 'create',
    summary: `AI-classified "${trimmed}" as HS ${classification.hsCode}`,
    after: { hsCode: classification.hsCode, dutyRatePct: classification.dutyRatePct, rodtepRatePct: classification.rodtepRatePct },
  });

  revalidatePath('/dashboard/hs-codes');
  return { ...hsCode, interactionId };
}
