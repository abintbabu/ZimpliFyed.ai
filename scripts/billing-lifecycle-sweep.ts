import { prisma } from '../src/lib/prisma';
import { writeDomainEvent } from '../src/lib/domain-events';
import { evaluateLifecycle, type LifecycleTenant } from '../src/lib/billing/lifecycle';

/**
 * Tenant lifecycle state machine sweep (BILLING_SPEC §3):
 *   trial(14d) -> active | free-downgrade
 *   active -> past_due -> suspended (day 15 of past_due) -> pending_deletion (day 60 of suspended)
 *   pending_deletion -> deleted (day 7 of pending_deletion)
 *
 * Run nightly (see .github/workflows/billing-lifecycle-sweep.yml). Postgres-table + polling worker per
 * AI_PLATFORM_SPEC §6 convention — no queue infra yet.
 *
 * Deliberately NOT wired: actual dunning email/WhatsApp sends (day 1/4/8 nudges) — no email provider is
 * configured yet (same gap ROADMAP.md notes for magic-link auth). Nudges are logged as `billing.dunning_nudge`
 * DomainEvents so a notifier can be layered on without touching this sweep once one exists.
 *
 * Deliberately NOT automated: the final pending_deletion -> deleted transition here only flips
 * `Tenant.status` — it does NOT run `prisma.tenant.delete()` (which would cascade-erase all tenant data).
 * BILLING_SPEC's "data never deleted for non-payment, only for explicit deletion" plus this codebase's own
 * safety norms around irreversible operations both argue for a human reviewing the list of `deleted`-status
 * tenants before anyone runs an actual hard-delete pass.
 */

/** All tenants in a non-terminal lifecycle state; the pure machine decides what (if anything) is due for each. */
async function sweepLifecycle() {
  const now = new Date();
  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ['trial', 'past_due', 'suspended', 'pending_deletion'] } },
  });

  for (const tenant of tenants) {
    const view: LifecycleTenant = {
      status: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      pastDueSince: tenant.pastDueSince,
      suspendedAt: tenant.suspendedAt,
      pendingDeletionAt: tenant.pendingDeletionAt,
      hasProvider: Boolean(tenant.billingProvider),
    };
    const decision = evaluateLifecycle(view, now);

    switch (decision.action) {
      case 'none':
        break;
      case 'clear_trial_marker':
        // Already checked out mid-trial — a subscription webhook set them active; just clear the marker.
        await prisma.tenant.update({ where: { id: tenant.id }, data: { trialEndsAt: null } });
        break;
      case 'downgrade_to_free':
        await prisma.tenant.update({ where: { id: tenant.id }, data: { plan: 'free', status: 'active', trialEndsAt: null } });
        await writeDomainEvent(prisma, { tenantId: tenant.id, type: decision.event });
        console.log(`[trial] ${tenant.slug}: downgraded to free`);
        break;
      case 'suspend':
        await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'suspended', suspendedAt: now } });
        await writeDomainEvent(prisma, { tenantId: tenant.id, type: decision.event });
        console.log(`[dunning] ${tenant.slug}: suspended`);
        break;
      case 'dunning_nudge':
        await writeDomainEvent(prisma, { tenantId: tenant.id, type: decision.event, payload: { day: decision.day } });
        console.log(`[dunning] ${tenant.slug}: nudge day ${decision.day} (no email provider wired — logged only)`);
        break;
      case 'to_pending_deletion':
        await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'pending_deletion', pendingDeletionAt: now } });
        await writeDomainEvent(prisma, { tenantId: tenant.id, type: decision.event });
        console.log(`[suspended] ${tenant.slug}: moved to pending_deletion (60d suspended)`);
        break;
      case 'to_deleted':
        await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'deleted' } });
        await writeDomainEvent(prisma, { tenantId: tenant.id, type: decision.event });
        console.log(`[pending_deletion] ${tenant.slug}: flagged status=deleted — REVIEW MANUALLY before any hard delete`);
        break;
    }
  }
}

async function main() {
  await sweepLifecycle();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
