'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin, writePlatformAudit } from '@/lib/platform/admin';
import { writeDomainEvent } from '@/lib/domain-events';
import { FEATURE_FLAGS, type FeatureFlagKey } from '@/lib/feature-flags';
import { isValidSlug, slugify } from '@/lib/slug';
import type { TenantStatus } from '@prisma/client';

/**
 * Platform-admin console actions (SELF_SERVE_PLAN §6, Phase D). Every action
 * re-checks `platform_admin` (never trusts the client) and records a
 * PlatformAuditEntry — impersonation and lifecycle actions must be traceable
 * independent of the affected tenant.
 */

async function tenantRef(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true, status: true } });
  if (!t) throw new Error('Tenant not found');
  return t;
}

export async function setFeatureFlag(
  tenantId: string,
  key: FeatureFlagKey,
  enabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const actor = await requirePlatformAdmin();
  if (!(key in FEATURE_FLAGS)) return { error: 'Unknown feature flag' };
  const t = await tenantRef(tenantId);

  await prisma.featureFlag.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, enabled, setByEmail: actor.email },
    update: { enabled, setByEmail: actor.email },
  });

  await writePlatformAudit({
    actor,
    action: 'feature_flag_set',
    tenantId,
    tenantSlug: t.slug,
    summary: `Set ${key} = ${enabled ? 'on' : 'off'} for ${t.name}`,
    metadata: { key, enabled },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true };
}

/** Clear a flag override so the tenant falls back to the code default. */
export async function clearFeatureFlag(
  tenantId: string,
  key: FeatureFlagKey,
): Promise<{ ok: true } | { error: string }> {
  const actor = await requirePlatformAdmin();
  const t = await tenantRef(tenantId);

  await prisma.featureFlag.deleteMany({ where: { tenantId, key } });

  await writePlatformAudit({
    actor,
    action: 'feature_flag_set',
    tenantId,
    tenantSlug: t.slug,
    summary: `Cleared ${key} override for ${t.name} (back to default)`,
    metadata: { key, cleared: true },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true };
}

export async function suspendTenant(
  tenantId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  const actor = await requirePlatformAdmin();
  const t = await tenantRef(tenantId);
  if (t.status === 'suspended') return { error: 'Tenant already suspended' };
  if (t.status === 'deleted') return { error: 'Tenant is deleted' };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { status: 'suspended', suspendedAt: new Date() },
    });
    await writeDomainEvent(tx, { tenantId, type: 'billing.suspended', payload: { by: 'platform_admin', reason } });
  });

  await writePlatformAudit({
    actor,
    action: 'tenant_suspend',
    tenantId,
    tenantSlug: t.slug,
    summary: `Suspended ${t.name}: ${reason || 'no reason given'}`,
    metadata: { reason, previousStatus: t.status },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath('/admin');
  return { ok: true };
}

export async function reactivateTenant(tenantId: string): Promise<{ ok: true } | { error: string }> {
  const actor = await requirePlatformAdmin();
  const t = await tenantRef(tenantId);
  if (t.status !== 'suspended') return { error: 'Only a suspended tenant can be reactivated here' };

  // A reactivated tenant returns to `active` if it has a live subscription, else `trial`.
  const full = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { providerSubscriptionId: true },
  });
  const nextStatus: TenantStatus = full?.providerSubscriptionId ? 'active' : 'trial';

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: nextStatus, suspendedAt: null, pendingDeletionAt: null },
  });

  await writePlatformAudit({
    actor,
    action: 'tenant_reactivate',
    tenantId,
    tenantSlug: t.slug,
    summary: `Reactivated ${t.name} → ${nextStatus}`,
    metadata: { nextStatus },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath('/admin');
  return { ok: true };
}

export async function reclaimSlug(
  tenantId: string,
  rawSlug: string,
): Promise<{ ok: true; slug: string } | { error: string }> {
  const actor = await requirePlatformAdmin();
  const t = await tenantRef(tenantId);
  const slug = slugify(rawSlug);
  if (!isValidSlug(slug)) return { error: 'Use 3–40 letters, numbers or hyphens (not a reserved word)' };

  const clash = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (clash && clash.id !== tenantId) return { error: 'That slug is already taken by another tenant' };

  await prisma.tenant.update({ where: { id: tenantId }, data: { slug } });

  await writePlatformAudit({
    actor,
    action: 'slug_reclaim',
    tenantId,
    tenantSlug: slug,
    summary: `Changed slug of ${t.name}: ${t.slug} → ${slug}`,
    metadata: { from: t.slug, to: slug },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true, slug };
}

/**
 * Records the start of a read-only "view as tenant" session. Impersonation is
 * audited AND surfaced to the tenant (§6): the PlatformAuditEntry carries the
 * tenantId, and the tenant's own audit log shows a platform-access marker.
 * The actual view is a read-only page; this action only records intent.
 */
export async function startImpersonation(
  tenantId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  const actor = await requirePlatformAdmin();
  const t = await tenantRef(tenantId);

  await prisma.$transaction(async (tx) => {
    await tx.platformAuditEntry.create({
      data: {
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: 'impersonate_start',
        tenantId,
        tenantSlug: t.slug,
        summary: `${actor.email} started a read-only view of ${t.name}: ${reason || 'support'}`,
        metadata: { reason },
      },
    });
    // Visible-to-tenant marker in their own audit log.
    await tx.auditEntry.create({
      data: {
        tenantId,
        collection: 'platform',
        documentId: tenantId,
        action: 'login',
        summary: `Zimplifyed support (${actor.email}) accessed your workspace (read-only): ${reason || 'support'}`,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: null,
        metadata: { platformAccess: true, reason },
      },
    });
  });

  return { ok: true };
}
