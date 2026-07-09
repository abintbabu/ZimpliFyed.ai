import 'server-only';
import { prisma } from './prisma';
import { emailDomain, isFreeMailDomain } from './slug';

export type Destination =
  | { kind: 'dashboard'; tenantSlug: string }
  | { kind: 'join-choice'; tenantSlug: string }
  | { kind: 'create' };

/**
 * The routing brain every sign-in funnels through (`/welcome`). Decides where a
 * freshly-authenticated user lands. Priority order per ONBOARDING_SPEC §2.
 * Also performs side effects: consuming pending email invites and a stashed
 * link-invite token so magic-link sign-ins get the same treatment as Google.
 */
export async function resolvePostAuthDestination(
  user: { id: string; email?: string | null },
  linkInviteToken?: string | null,
): Promise<Destination> {
  const email = user.email?.trim().toLowerCase() ?? null;

  // 0. Stashed link-invite token (cookie set before auth).
  if (linkInviteToken) {
    const slug = await consumeLinkInvite(user.id, linkInviteToken);
    if (slug) {
      await setLastActive(user.id, slug.tenantId);
      return { kind: 'dashboard', tenantSlug: slug.slug };
    }
  }

  // 1. Pending email invites → consume ALL, land in the newest.
  if (email) {
    const pending = await prisma.invite.findMany({
      where: { email, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    let newestTenantId: string | null = null;
    for (const invite of pending) {
      await prisma.$transaction([
        prisma.membership.upsert({
          where: { userId_tenantId: { userId: user.id, tenantId: invite.tenantId } },
          create: { userId: user.id, tenantId: invite.tenantId, role: invite.role },
          update: {},
        }),
        prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
      ]);
      newestTenantId ??= invite.tenantId;
    }
    if (newestTenantId) {
      const t = await setLastActive(user.id, newestTenantId);
      if (t) return { kind: 'dashboard', tenantSlug: t };
    }
  }

  // 2. Existing memberships → lastActive if still a member, else most recent.
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { tenant: { select: { slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (memberships.length > 0) {
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { lastActiveTenantId: true } });
    const active = memberships.find((m) => m.tenantId === u?.lastActiveTenantId) ?? memberships[0];
    await setLastActive(user.id, active.tenantId);
    return { kind: 'dashboard', tenantSlug: active.tenant.slug };
  }

  // 3. Domain auto-join match → choice screen.
  const domain = emailDomain(email);
  if (domain && !isFreeMailDomain(domain)) {
    const match = await prisma.tenant.findFirst({
      where: { autoJoinDomain: domain, autoJoinMode: { not: 'off' } },
      select: { slug: true },
    });
    if (match) return { kind: 'join-choice', tenantSlug: match.slug };
  }

  // 4. Nothing → wizard.
  return { kind: 'create' };
}

async function setLastActive(userId: string, tenantId: string): Promise<string | null> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!t) return null;
  await prisma.user.update({ where: { id: userId }, data: { lastActiveTenantId: tenantId } });
  return t.slug;
}

async function consumeLinkInvite(
  userId: string,
  token: string,
): Promise<{ tenantId: string; slug: string } | null> {
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { tenant: { select: { slug: true } } },
  });
  if (!invite) return null;
  if (invite.expiresAt && invite.expiresAt < new Date()) return null;
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return null;

  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_tenantId: { userId, tenantId: invite.tenantId } },
      create: { userId, tenantId: invite.tenantId, role: invite.role },
      update: {},
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { useCount: { increment: 1 } } }),
  ]);
  return { tenantId: invite.tenantId, slug: invite.tenant.slug };
}
