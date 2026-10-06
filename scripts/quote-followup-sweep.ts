import { prisma } from '../src/lib/prisma';
import { writeDomainEvent } from '../src/lib/domain-events';
import { enqueueAction } from '../src/lib/action-queue';
import { draftBuyerFollowup } from '../src/lib/ai/buyer-followup';
import { dueCadenceStep, parseCadence, type CadenceStep, type CadenceKind } from '../src/lib/cadence';

/**
 * Quote follow-up cadence engine v1 (DEV_PLAN_100 Sprint 5, L1 autonomy).
 *
 * Off DomainEvents: for each `quote.sent` whose quote is still in `sent` (not accepted/declined/expired), the
 * next DUE step of the tenant's cadence (default: day-3 nudge, day-7 re-quote, day-90 reactivation — see
 * src/lib/cadence.ts) is drafted by the AI and lands in the Action Queue for a human to review and send. It is
 * never auto-sent — L1 means drafted-for-approval.
 *
 * Run nightly (same convention as billing/compliance sweeps: Postgres table + polling, no queue infra). Needs
 * the react-server condition because it calls runAi via draftBuyerFollowup:
 *   tsx --conditions=react-server scripts/quote-followup-sweep.ts
 *
 * Dedup: each drafted step writes a `quote.followup_drafted` DomainEvent (refId = quote id); their count is the
 * cadence position, and the action's dedupeKey includes the step index, so re-running never double-drafts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Quotes sent longer ago than this are no longer chased (the default cadence ends at day 90). */
const LOOKBACK_DAYS = 400;

// The cadence is a per-tenant setting (TenantSettings.commercial.followupCadence); absent or malformed → the default
// day-3 nudge / day-7 re-quote / day-90 reactivation.
const cadenceCache = new Map<string, CadenceStep[]>();
async function cadenceFor(tenantId: string): Promise<CadenceStep[]> {
  const hit = cadenceCache.get(tenantId);
  if (hit) return hit;
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId }, select: { commercial: true } });
  const raw = (settings?.commercial as { followupCadence?: unknown } | null)?.followupCadence;
  const cadence = parseCadence(raw);
  cadenceCache.set(tenantId, cadence);
  return cadence;
}

const INSTRUCTION: Record<CadenceKind, string> = {
  nudge: 'Draft a short, friendly follow-up nudging for a response, without being pushy.',
  requote: 'The first nudge went unanswered. Draft a short message offering to revisit the price, quantity or terms, and asking what is holding up a decision.',
  reactivate: 'This quote went quiet long ago. Draft a brief, low-pressure check-in that keeps the door open and asks whether the requirement is still live.',
};

async function findAssignee(tenantId: string) {
  const membership =
    (await prisma.membership.findFirst({
      where: { tenantId, role: { in: ['admin', 'super_admin', 'owner'] } },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })) ?? (await prisma.membership.findFirst({ where: { tenantId }, include: { user: true }, orderBy: { createdAt: 'asc' } }));
  if (!membership) return null;
  return { userId: membership.userId, name: membership.user.name ?? membership.user.email ?? 'Owner', role: membership.role };
}

async function sweepQuoteFollowups() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
  // Nightly sweep across ALL tenants by design — each event's own tenantId scopes its downstream
  // processing (see the rest of this loop).
  // tenant-safe: cross-tenant sweep by design
  const sentEvents = await prisma.domainEvent.findMany({
    where: { type: 'quote.sent', createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });

  let drafted = 0;
  for (const event of sentEvents) {
    if (!event.refId) continue;
    const quoteId = event.refId;

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId: event.tenantId },
      include: { buyer: true, lines: true },
    });
    // Only chase a quote that is still awaiting a response; accepted / declined / expired ends the cadence.
    if (!quote || quote.status !== 'sent') continue;

    // Steps already drafted for this quote = the cadence position. Only the EARLIEST unhandled step is ever
    // due, so a long-quiet quote gets one draft per run, never a burst of catch-up messages.
    const stepsDone = await prisma.domainEvent.count({ where: { tenantId: event.tenantId, type: 'quote.followup_drafted', refId: quoteId } });
    const due = dueCadenceStep({ anchor: event.createdAt, stepsDone, now: new Date(), cadence: await cadenceFor(event.tenantId) });
    if (!due) continue;

    const assignee = await findAssignee(event.tenantId);
    if (!assignee) continue;

    const daysSilent = Math.floor((Date.now() - event.createdAt.getTime()) / DAY_MS);
    const context = [
      `Quote ${quote.quoteNumber} was sent to ${quote.buyer?.name ?? 'the buyer'} ${daysSilent} days ago with no reply.`,
      `Value: ${quote.currency} ${quote.total.toFixed(2)}.`,
      `Items: ${quote.lines.map((l) => `${l.quantity} x ${l.description}`).join('; ') || 'n/a'}.`,
      INSTRUCTION[due.step.kind],
    ].join('\n');

    let draft: { subject: string; body: string };
    let interactionId: string;
    try {
      ({ draft, interactionId } = await draftBuyerFollowup(context, event.tenantId, assignee.userId));
    } catch (err) {
      console.error(`[followup] ${quote.quoteNumber}: draft failed — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // Route the drafted nudge into the cross-department Action Queue (SELL) so it lands in the one
    // approve/edit/reject inbox; the AiInteraction is consumed through the single-shot gate on approval.
    await enqueueAction({
      tenantId: event.tenantId,
      kind: 'send_followup',
      department: 'SELL',
      title: `${due.step.kind === 'requote' ? 'Re-quote' : due.step.kind === 'reactivate' ? 'Check in on' : 'Follow up on'} ${quote.quoteNumber} — ${quote.buyer?.name ?? 'buyer'}`,
      summary: draft.subject,
      payload: { subject: draft.subject, body: draft.body },
      linkedType: 'quote',
      linkedId: quoteId,
      dedupeKey: `send_followup:quote:${quoteId}:${due.index}`,
      aiInteractionId: interactionId,
    });

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
      await writeDomainEvent(tx, { tenantId: event.tenantId, type: 'quote.followup_drafted', refId: quoteId, payload: { quoteNumber: quote.quoteNumber, daysSilent, step: due.index, kind: due.step.kind } });
    });

    drafted += 1;
    console.log(`[followup] ${quote.quoteNumber}: drafted ${due.step.kind} (step ${due.index + 1}, silent ${daysSilent}d)`);
  }

  console.log(`Quote follow-up sweep done: ${drafted} nudge(s) drafted from ${sentEvents.length} sent quote(s).`);
}

sweepQuoteFollowups()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
