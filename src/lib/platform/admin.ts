import 'server-only';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { PlatformAuditAction, Prisma } from '@prisma/client';

export type PlatformActor = { userId: string; email: string };

/**
 * The single chokepoint for the platform-admin console (SELF_SERVE_PLAN §6).
 * `platform_admin` is a Zimplifyed-employee capability that is NEVER derived
 * from any tenant role — a tenant owner must never reach these surfaces.
 * Throws (callers in Server Components should redirect on catch; the /admin
 * layout does this centrally).
 */
export async function requirePlatformAdmin(): Promise<PlatformActor> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) throw new Error('Not authenticated');
  if (user.platformRole !== 'platform_admin') throw new Error('Not a platform admin');
  return { userId: user.id, email: user.email ?? 'unknown' };
}

export async function isPlatformAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.platformRole === 'platform_admin';
}

type WritePlatformAuditInput = {
  actor: PlatformActor;
  action: PlatformAuditAction;
  tenantId?: string | null;
  tenantSlug?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

/** Records a platform-staff action. Impersonation + lifecycle events must be
 *  traceable independently of the affected tenant (§6). */
export async function writePlatformAudit(input: WritePlatformAuditInput): Promise<void> {
  await prisma.platformAuditEntry.create({
    data: {
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      action: input.action,
      tenantId: input.tenantId ?? null,
      tenantSlug: input.tenantSlug ?? null,
      summary: input.summary,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
