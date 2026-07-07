import 'server-only';
import { prisma } from '@/lib/prisma';
import type { AuditAction, MembershipRole, Prisma } from '@prisma/client';
import type { TenantSession } from '@/lib/session-tenant';
import { auth } from '@/auth';

type WriteAuditInput = {
  session: TenantSession;
  collection: string;
  documentId: string;
  action: AuditAction;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

/** The single chokepoint every mutating server action calls to record an AuditEntry. */
export async function writeAudit(input: WriteAuditInput) {
  const session = await auth();
  const actorEmail = session?.user?.email ?? 'unknown';

  await prisma.auditEntry.create({
    data: {
      tenantId: input.session.tenantId,
      collection: input.collection,
      documentId: input.documentId,
      action: input.action,
      summary: input.summary,
      actorUserId: input.session.userId,
      actorEmail,
      actorRole: input.session.role as MembershipRole,
      beforeJson: input.before !== undefined ? JSON.stringify(input.before) : null,
      afterJson: input.after !== undefined ? JSON.stringify(input.after) : null,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
