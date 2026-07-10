'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { screenAgainstConsolidatedList } from '@/lib/screening';
import { requireFeature } from '@/lib/billing/entitlements';

export async function listScreeningChecks(tenantId: string) {
  return prisma.screeningCheck.findMany({ where: { tenantId }, orderBy: { checkedAt: 'desc' }, take: 50 });
}

export async function runScreeningCheck(input: { subjectName: string; country?: string }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'compliance:write')) {
    throw new Error('You do not have permission to run screening checks');
  }
  await requireFeature(tenantId, 'screening');
  const subjectName = input.subjectName.trim();
  if (!subjectName) throw new Error('Enter a buyer/consignee name to screen');

  const lookup = await screenAgainstConsolidatedList(subjectName, input.country);

  const check = await prisma.screeningCheck.create({
    data: {
      tenantId,
      subjectName,
      country: input.country?.trim() || null,
      result: lookup.mode === 'api' ? (lookup.matches.length > 0 ? 'potential_match' : 'clear') : 'manual_attestation',
      matches: lookup.mode === 'api' ? lookup.matches : undefined,
      source: lookup.mode === 'api' ? 'trade.gov Consolidated Screening List' : 'manual',
      notes: lookup.mode === 'manual' ? lookup.reason : null,
      checkedByUserId: userId,
    },
  });

  await writeAudit({
    session,
    collection: 'screening_checks',
    documentId: check.id,
    action: 'create',
    summary: `Screened "${subjectName}": ${check.result}`,
    after: { subjectName, result: check.result },
  });

  revalidatePath('/dashboard/screening');
  return check;
}

export async function recordManualScreeningResult(input: {
  subjectName: string;
  country?: string;
  cleared: boolean;
  notes: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'compliance:write')) {
    throw new Error('You do not have permission to record screening checks');
  }
  const subjectName = input.subjectName.trim();
  if (!subjectName) throw new Error('Enter a buyer/consignee name');
  if (!input.notes.trim()) throw new Error('Note which list(s) you checked manually');

  const check = await prisma.screeningCheck.create({
    data: {
      tenantId,
      subjectName,
      country: input.country?.trim() || null,
      result: input.cleared ? 'clear' : 'potential_match',
      source: 'manual',
      notes: input.notes.trim(),
      checkedByUserId: userId,
    },
  });

  await writeAudit({
    session,
    collection: 'screening_checks',
    documentId: check.id,
    action: 'create',
    summary: `Manually recorded screening of "${subjectName}": ${check.result}`,
    after: { subjectName, result: check.result },
  });

  revalidatePath('/dashboard/screening');
  return check;
}
