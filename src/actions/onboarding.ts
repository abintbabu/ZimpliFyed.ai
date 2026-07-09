'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { isValidSlug, slugify } from '@/lib/slug';
import { seedDemoData, clearDemoData as clearDemo } from '@/lib/seed-demo';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import type { BusinessType, MembershipRole } from '@prisma/client';

const MAX_OWNED_TENANTS = 3;

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
}

export async function checkSlug(raw: string): Promise<{ available: boolean; slug: string; reason?: string }> {
  const slug = slugify(raw);
  const ip = await clientIp();
  const rl = await checkRateLimitDb(`slugcheck:${ip}`, 60, 60_000);
  if (!rl.allowed) return { available: false, slug, reason: 'Too many checks, slow down' };
  if (!isValidSlug(slug)) return { available: false, slug, reason: 'Use 3–40 letters, numbers or hyphens' };
  const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  return existing ? { available: false, slug, reason: 'Already taken' } : { available: true, slug };
}

const createOrgSchema = z.object({
  companyName: z.string().min(2).max(80),
  slug: z.string().min(3).max(40),
  businessType: z.enum(['merchant', 'manufacturer', 'both']),
  exportProducts: z.string().max(200).optional(),
  primaryMarkets: z.array(z.string().length(2)).max(5).optional(),
  teamSizeBand: z.enum(['1-5', '6-20', '21-50', '50+']).optional(),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export async function createOrganization(input: CreateOrgInput): Promise<{ error: string } | never> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return { error: 'Not authenticated' };

  const parsed = createOrgSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { platformRole: true } });
  const isPlatformAdmin = dbUser?.platformRole === 'platform_admin';

  // Abuse valves: rate limit + owned-tenant cap.
  if (!isPlatformAdmin) {
    const ip = await clientIp();
    const byUser = await checkRateLimitDb(`orgcreate:user:${user.id}`, 3, 86_400_000);
    if (!byUser.allowed) return { error: 'Daily org-creation limit reached' };
    const byIp = await checkRateLimitDb(`orgcreate:ip:${ip}`, 10, 86_400_000);
    if (!byIp.allowed) return { error: 'Daily org-creation limit reached for this network' };

    const owned = await prisma.membership.count({ where: { userId: user.id, role: 'super_admin' } });
    if (owned >= MAX_OWNED_TENANTS) return { error: `You can own at most ${MAX_OWNED_TENANTS} organizations` };
  }

  if (!isValidSlug(data.slug)) return { error: 'Invalid workspace address' };
  const clash = await prisma.tenant.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (clash) return { error: 'That workspace address is taken' };

  const tenant = await prisma.tenant.create({
    data: {
      slug: data.slug,
      name: data.companyName,
      status: 'trial',
      plan: 'free',
      businessType: data.businessType as BusinessType,
      exportProducts: data.exportProducts || null,
      primaryMarkets: data.primaryMarkets ?? [],
      teamSizeBand: data.teamSizeBand || null,
      onboarding: {},
      memberships: { create: { userId: user.id, role: 'super_admin' } },
    },
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastActiveTenantId: tenant.id } });

  await prisma.auditEntry.create({
    data: {
      tenantId: tenant.id, collection: 'tenants', documentId: tenant.id, action: 'create',
      summary: `Organization "${tenant.name}" created`, actorUserId: user.id,
      actorEmail: user.email ?? 'unknown', actorRole: 'super_admin',
    },
  });

  // Seed demo data (best-effort; wizard never fails on seed).
  try {
    await seedDemoData(tenant.id, data.businessType as BusinessType);
  } catch (e) {
    console.error('demo seed failed', e);
  }

  redirect('/dashboard?welcome=1');
}

/** Domain auto-join: the user's email domain matches a tenant's autoJoinDomain. */
export async function joinByDomain(tenantSlug: string): Promise<{ error: string } | never> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return { error: 'Not authenticated' };

  const { emailDomain } = await import('@/lib/slug');
  const domain = emailDomain(user.email);
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, autoJoinDomain: true, autoJoinMode: true },
  });
  if (!tenant || tenant.autoJoinMode === 'off' || tenant.autoJoinDomain !== domain) {
    return { error: 'This organization is no longer accepting domain sign-ups' };
  }

  if (tenant.autoJoinMode === 'require_approval') {
    // Surfaced on /dashboard/users as a pending request (Invite row without token).
    await prisma.invite.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: user.email } },
      create: { tenantId: tenant.id, email: user.email, role: 'viewer', invitedByUserId: user.id },
      update: {},
    });
    redirect('/welcome?requested=1');
  }

  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    create: { userId: user.id, tenantId: tenant.id, role: 'viewer' },
    update: {},
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveTenantId: tenant.id } });
  redirect('/dashboard');
}

export async function clearDemoData(): Promise<{ error: string } | { ok: true }> {
  const s = await requireTenantSession();
  if (!hasPermission(s.role, 'users:manage')) return { error: 'Not allowed' };
  await clearDemo(s.tenantId);
  return { ok: true };
}

/** Phase B tenant switcher: remember the chosen org and route to its workspace host. */
export async function switchTenant(tenantSlug: string): Promise<{ error: string } | never> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated' };
  const membership = session.user.memberships.find((m) => m.tenantSlug === tenantSlug);
  if (!membership) return { error: 'You are not a member of that organization' };

  await prisma.user.update({ where: { id: session.user.id }, data: { lastActiveTenantId: membership.tenantId } });

  const base = process.env.NEXT_PUBLIC_APP_DOMAIN;
  if (base && process.env.NODE_ENV === 'production') {
    redirect(`https://${tenantSlug}.${base}/dashboard`);
  }
  redirect('/dashboard');
}

// ── Onboarding checklist ──

export type ChecklistState = {
  complianceFilled: boolean;
  teammateInvited: boolean;
  firstQuote: boolean;
  leadsImported: boolean;
  copilotUsed: boolean;
};

/** Cheap existence queries; stamps completion timestamps into Tenant.onboarding so we stop recomputing solved steps. */
export async function computeChecklist(tenantId: string): Promise<ChecklistState> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { onboarding: true } });
  const stamped = (tenant?.onboarding ?? {}) as Record<string, string>;

  const [complianceFilled, memberships, firstQuote, leads, copilot] = await Promise.all([
    stamped.complianceFilled ? 1 : prisma.complianceItem.count({ where: { tenantId, documentNumber: { not: null } } }),
    stamped.teammateInvited ? 1 : prisma.membership.count({ where: { tenantId } }),
    stamped.firstQuote ? 1 : prisma.quote.count({ where: { tenantId, isDemo: false } }),
    stamped.leadsImported ? 1 : prisma.lead.count({ where: { tenantId, isDemo: false } }),
    stamped.copilotUsed ? 1 : prisma.aiInteraction.count({ where: { tenantId } }),
  ]);

  const state: ChecklistState = {
    complianceFilled: !!stamped.complianceFilled || complianceFilled > 0,
    teammateInvited: !!stamped.teammateInvited || memberships > 1,
    firstQuote: !!stamped.firstQuote || firstQuote > 0,
    leadsImported: !!stamped.leadsImported || leads > 0,
    copilotUsed: !!stamped.copilotUsed || copilot > 0,
  };

  // Stamp any newly-completed steps.
  const nowIso = new Date().toISOString();
  const next = { ...stamped };
  let changed = false;
  for (const [k, done] of Object.entries(state)) {
    if (done && !next[k]) { next[k] = nowIso; changed = true; }
  }
  if (changed) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { onboarding: next } });
    await prisma.meterEvent.createMany({
      data: Object.keys(state)
        .filter((k) => next[k] === nowIso)
        .map((k) => ({ tenantId, kind: 'ai_action' as const, metadata: { event: 'onboarding.step_completed', step: k } })),
    });
  }

  return state;
}

// ── Invite links (extends Invite) ──

export async function createInviteLink(role: MembershipRole, opts?: { maxUses?: number; expiresInDays?: number }) {
  const s = await requireTenantSession();
  if (!hasPermission(s.role, 'users:manage')) return { error: 'Not allowed' as const };
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(18).toString('base64url');
  await prisma.invite.create({
    data: {
      tenantId: s.tenantId, email: null, role, token,
      maxUses: opts?.maxUses ?? null,
      expiresAt: opts?.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86_400_000) : null,
      invitedByUserId: s.userId,
    },
  });
  return { token };
}

export async function revokeInvite(inviteId: string) {
  const s = await requireTenantSession();
  if (!hasPermission(s.role, 'users:manage')) return { error: 'Not allowed' as const };
  await prisma.invite.deleteMany({ where: { id: inviteId, tenantId: s.tenantId } });
  return { ok: true as const };
}

export async function bulkInvite(emails: string[], role: MembershipRole) {
  const s = await requireTenantSession();
  if (!hasPermission(s.role, 'users:manage')) return { error: 'Not allowed' as const };
  const { hasSeatAvailable } = await import('@/lib/billing/entitlements');
  if (!(await hasSeatAvailable(s.tenantId))) return { error: 'Seat limit reached — upgrade your plan to invite more teammates' as const };
  const cleaned = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)))].slice(0, 50);
  const rl = await checkRateLimitDb(`invite:${s.tenantId}`, 100, 3_600_000);
  if (!rl.allowed) return { error: 'Invite rate limit reached, try later' as const };
  let created = 0;
  for (const email of cleaned) {
    try {
      await prisma.invite.create({ data: { tenantId: s.tenantId, email, role, invitedByUserId: s.userId } });
      created++;
    } catch { /* duplicate (tenantId,email) — skip */ }
  }
  return { created, skipped: cleaned.length - created };
}
