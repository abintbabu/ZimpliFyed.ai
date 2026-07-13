import { prisma } from '../src/lib/prisma';
import { writeDomainEvent } from '../src/lib/domain-events';
import { draftBuyerFollowup } from '../src/lib/ai/buyer-followup';

/**
 * Quote follow-up cadence engine v1 (DEV_PLAN_100 Sprint 5, L1 autonomy).
 *
 * Off DomainEvents: for each `quote.sent` that's been silent for >= FOLLOWUP_AFTER_DAYS and whose quote is
 * still in `sent` (not accepted/declined/expired), the AI drafts a nudge and it lands as an OPEN Task for a
 * human to review and send. It is never auto-sent — L1 means drafted-for-approval.
 *
 * Run nightly (same convention as billing/compliance sweeps: Postgres table + polling, no queue infra). Needs
 * the react-server condition because it calls runAi via draftBuyerFollowup:
 *   tsx --conditions=react-server scripts/quote-followup-sweep.ts
 *
 * Dedup: one draft per quote.sent event — a `quote.followup_drafted` DomainEvent (refId = quote id) marks a
 * quote as already nudged, so re-running the sweep never double-drafts.
 */

const FOLLOWUP_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

async function findAssignee(tenantId: string) {
  const membership =
    (await prisma.membership.findFirst({
      where: { tenantId, role: { in: ['admin', 'super_admin'] } },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })) ?? (await prisma.membership.findFirst({ where: { tenantId }, include: { user: true }, orderBy: { createdAt: 'asc' } }));
  if (!membership) return null;
  return { userId: membership.userId, name: membership.user.name ?? membership.user.email ?? 'Owner', role: membership.role };
}

async function sweepQuoteFollowups() {
  const cutoff = new Date(Date.now() - FOLLOWUP_AFTER_DAYS * DAY_MS);
  const sentEvents = await prisma.domainEvent.findMany({
    where: { type: 'quote.sent', createdAt: { lte: cutoff } },
    orderBy: { createdAt: 'asc' },
  });

  let drafted = 0;
  for (const event of sentEvents) {
    if (!event.refId) continue;
    const quoteId = event.refId;

    // Already nudged for this send? Skip.
    const already = await prisma.domainEvent.findFirst({
      where: { tenantId: event.tenantId, type: 'quote.followup_drafted', refId: quoteId },
    });
    if (already) continue;

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId: event.tenantId },
      include: { buyer: true, lines: true },
    });
    // Only nudge a quote that is still awaiting a response.
    if (!quote || quote.status !== 'sent') continue;

    const assignee = await findAssignee(event.tenantId);
    if (!assignee) continue;

    const daysSilent = Math.floor((Date.now() - event.createdAt.getTime()) / DAY_MS);
    const context = [
      `Quote ${quote.quoteNumber} was sent to ${quote.buyer?.name ?? 'the buyer'} ${daysSilent} days ago with no reply.`,
      `Value: ${quote.currency} ${quote.total.toFixed(2)}.`,
      `Items: ${quote.lines.map((l) => `${l.quantity} x ${l.description}`).join('; ') || 'n/a'}.`,
      `Draft a short, friendly follow-up nudging for a response, without being pushy.`,
    ].join('\n');

    let draft: { subject: string; body: string };
    try {
      ({ draft } = await draftBuyerFollowup(context, event.tenantId, assignee.userId));
    } catch (err) {
      console.error(`[followup] ${quote.quoteNumber}: draft failed — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.create({
        data: {
          tenantId: event.tenantId,
          title: `Follow up on ${quote.quoteNumber} — ${quote.buyer?.name ?? 'buyer'}`,
          description: `${draft.subject}\n\n${draft.body}`,
          priority: 'medium',
          status: 'open',
          assigneeUserId: assignee.userId,
          assigneeName: assignee.name,
          assigneeRole: assignee.role,
          linkedType: 'general',
          linkedId: quoteId,
          linkedLabel: quote.quoteNumber,
          createdByUserId: assignee.userId,
        },
      });
      await writeDomainEvent(tx, { tenantId: event.tenantId, type: 'quote.followup_drafted', refId: quoteId, payload: { quoteNumber: quote.quoteNumber, daysSilent } });
    });

    drafted += 1;
    console.log(`[followup] ${quote.quoteNumber}: drafted nudge (silent ${daysSilent}d)`);
  }

  console.log(`Quote follow-up sweep done: ${drafted} nudge(s) drafted from ${sentEvents.length} sent quote(s).`);
}

sweepQuoteFollowups()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
