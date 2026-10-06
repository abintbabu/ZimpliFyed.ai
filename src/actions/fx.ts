'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { latestRates, validateRateEntry, DEFAULT_BASE_CURRENCY } from '@/lib/fx';

/** Latest rate per currency plus recent history, for the settings page and any reader that needs rates. */
export async function listFxRates() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'analytics:read') && !hasPermission(role, 'settings:manage')) return null;

  const snapshots = await prisma.fxSnapshot.findMany({ where: { tenantId }, orderBy: { asOf: 'desc' }, take: 200 });
  return {
    baseCurrency: DEFAULT_BASE_CURRENCY,
    rates: latestRates(snapshots),
    history: snapshots.slice(0, 20).map((s) => ({ id: s.id, currency: s.currency, rateToBase: s.rateToBase, asOf: s.asOf, source: s.source })),
  };
}

/** Records a rate (1 CURRENCY = rate × base). History is kept — rows are appended, never overwritten. */
export async function setFxRate(input: { currency: string; rateToBase: number; asOf?: string }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'settings:manage')) throw new Error('You do not have permission to change exchange rates');

  const problem = validateRateEntry(input.currency, input.rateToBase);
  if (problem) throw new Error(problem);

  const asOf = input.asOf ? new Date(`${input.asOf}T00:00:00Z`) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error('That date is not valid');
  if (asOf.getTime() > Date.now() + 86_400_000) throw new Error('A rate cannot be dated in the future');

  const currency = input.currency.trim().toUpperCase();
  const snap = await prisma.fxSnapshot.create({
    data: { tenantId, currency, baseCurrency: DEFAULT_BASE_CURRENCY, rateToBase: input.rateToBase, asOf, source: 'manual', createdByUserId: userId },
  });

  await writeAudit({
    session,
    collection: 'fx_rates',
    documentId: snap.id,
    action: 'create',
    summary: `Set ${currency} rate to ${input.rateToBase} ${DEFAULT_BASE_CURRENCY}`,
    after: { currency, rateToBase: input.rateToBase },
  });

  revalidatePath('/dashboard/settings/fx');
  revalidatePath('/dashboard/cash-flow');
  return snap;
}
