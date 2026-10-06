import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { hasPermission, ROLE_PERMISSIONS, type Permission } from '../../lib/permissions';
import { isTenantAccessBlocked } from '../../lib/tenant-status';
import type { MembershipRole, TenantStatus } from '@prisma/client';

/**
 * Read-authorization coverage + the suspension matrix. Pure, no DB: `npm run test:read-perms`.
 *
 * Context: closing the cross-tenant hole made every read action derive its own tenantId from the
 * session, which stops a caller reading *another tenant's* data. It did not stop a low-privileged
 * member of the *same* tenant calling a read their role shouldn't have — each `'use server'` export
 * is its own POST endpoint, so the page-level gate above it protects the UI, not the action.
 *
 * Part 1 is a scan: it fails if a tenant-reading action has no permission check, so the gap can't
 * reopen one new action at a time. Part 2 pins the role matrix. Part 3 covers suspension.
 */

// ── Part 1: every tenant-reading action must check a permission ───────────────
/**
 * Actions that legitimately read tenant data with no permission check. Every entry is an
 * authorization exception and has to justify itself, same discipline as the isolation scan's
 * allowlists.
 */
const NO_PERMISSION_REQUIRED = new Map<string, string>([
  // Onboarding/own-workspace surfaces: available to any member of the tenant by design.
  ['computeChecklist', 'onboarding progress for the caller’s own workspace, shown to every member'],
  ['getTenantProfile', 'the caller’s own company profile; the settings page lets any member view it and gates editing on settings:manage'],
  // Session-scoped: these resolve the caller's own identity/memberships, not tenant business data.
  ['listMyTenants', 'the caller’s own memberships'],
  // The Copilot authorizes structurally, one layer down: askCopilot() builds its tool set with
  // toolsForRole((p) => hasPermission(role, p)), so a Sales caller is never handed, say,
  // list_quote_margins. A single coarse gate here would be weaker, not stronger.
  ['askCopilotAction', 'askCopilot() filters its retrieval tools by the caller’s role'],
  // Rating an AI output the caller already received, on their own tenant's interaction row.
  ['submitAiFeedback', 'feedback on the caller’s own tenant’s AiInteraction; discloses nothing new'],
]);

/**
 * Guard forms that aren't a literal `hasPermission(role, 'x:y')` call. Each delegates the decision
 * to a helper that performs the check, so the scanner accepts them — but they're enumerated here
 * rather than pattern-matched loosely, so a new indirection has to be added deliberately.
 */
const GUARD_HELPERS = [
  /deny(Invite|RoleChange|MemberRemoval|RoleAssignment)\s*\(/,  // src/lib/team-guards.ts
  /requireCollection(Read|Write)Access\s*\(/,                   // src/actions/documents.ts
  // A hasPermission() call whose permission comes from a variable or lookup table rather than a
  // string literal (e.g. ACTIVITY_WRITE_PERMISSION[entityType]). This scan asks whether an action
  // authorizes *at all*; whether it picked the right permission is Part 2's job and review's.
  /hasPermission\s*\(/,
];

/** Actions known to be guarded by one of GUARD_HELPERS, asserted below so the list can't rot. */
const GUARDED_BY_HELPER = new Map<string, string>([
  ['inviteUser', 'denyInvite()'],
  ['bulkInvite', 'denyInvite()'],
  ['createInviteLink', 'denyInvite()'],
  ['updateMemberRole', 'denyRoleChange()'],
  ['removeMember', 'denyMemberRemoval()'],
  ['listDocuments', 'requireCollectionReadAccess()'],
  ['getDocumentDownloadUrl', 'requireCollectionReadAccess()'],
  ['uploadDocument', 'requireCollectionWriteAccess()'],
  ['deleteDocument', 'requireCollectionWriteAccess()'],
  ['createActivity', 'ACTIVITY_WRITE_PERMISSION lookup'],
  ['completeActivity', 'ACTIVITY_WRITE_PERMISSION lookup'],
]);

type ActionInfo = { file: string; name: string; permission: Permission | null; guardedByHelper: boolean };

function scanActions(): ActionInfo[] {
  const dir = path.join(process.cwd(), 'src', 'actions');
  const out: ActionInfo[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(path.join(dir, file), 'utf8');
    if (!src.includes("'use server'")) continue;
    for (const part of src.split(/\nexport async function /).slice(1)) {
      const name = part.slice(0, part.indexOf('(')).trim();
      const body = part.split(/\nexport /)[0];
      // Only actions that authenticate a tenant session are in scope; platform-admin actions and
      // pure helpers are governed elsewhere.
      if (!/requireTenantSession/.test(body)) continue;
      // The role identifier varies by call site (role, session.role, callerRole, s.role), so
      // match any identifier rather than a fixed name — a stricter pattern reports false gaps.
      const m = body.match(/hasPermission\(\s*[A-Za-z_$][\w$.]*\s*,\s*'([a-z_]+:[a-z_]+)'\s*\)/);
      out.push({
        file,
        name,
        permission: (m?.[1] as Permission) ?? null,
        guardedByHelper: GUARD_HELPERS.some((re) => re.test(body)),
      });
    }
  }
  return out;
}

{
  const actions = scanActions();
  assert.ok(actions.length > 80, `expected to scan many actions, found ${actions.length} — parser likely broke`);

  const unguarded = actions.filter(
    (a) => !a.permission && !a.guardedByHelper && !NO_PERMISSION_REQUIRED.has(a.name),
  );
  assert.deepEqual(
    unguarded.map((a) => `${a.file}:${a.name}`),
    [],
    'these actions authenticate a tenant session but authorize nothing — add a hasPermission() ' +
      'check, or justify the exception in NO_PERMISSION_REQUIRED',
  );

  // Dead exemptions fail too, so the allowlists can't rot into permanent holes.
  const names = new Set(actions.map((a) => a.name));
  for (const name of NO_PERMISSION_REQUIRED.keys()) {
    if (!names.has(name)) continue; // action removed entirely — harmless
    const a = actions.find((x) => x.name === name)!;
    assert.equal(a.permission, null, `${name} now checks a permission — remove it from NO_PERMISSION_REQUIRED`);
  }
  for (const name of GUARDED_BY_HELPER.keys()) {
    assert.ok(names.has(name), `GUARDED_BY_HELPER lists ${name}, which no longer exists — remove it`);
    assert.ok(
      actions.find((x) => x.name === name)!.guardedByHelper,
      `${name} is listed as helper-guarded but no deny*() call remains in its body`,
    );
  }

  // Every permission referenced by an action must exist in the matrix (catches typos, which would
  // otherwise fail *open* for no role at all — or worse, silently never match).
  for (const a of actions) {
    if (!a.permission) continue;
    const known = Object.values(ROLE_PERMISSIONS).some((ps) => (ps as Permission[]).includes(a.permission!));
    assert.ok(known, `${a.file}:${a.name} checks '${a.permission}', which no role grants — typo?`);
  }
}

// ── Part 2: the read matrix, role by role ────────────────────────────────────
// Each row is a read a role must or must not be able to perform. These are the separations that
// matter commercially: margins, the expense ledger, and the member list.
{
  const CAN: [MembershipRole, Permission][] = [
    ['viewer', 'quotes:read'], ['viewer', 'orders:read'], ['viewer', 'invoices:read'],
    ['sales', 'customers:read'], ['sales', 'quotes:read'], ['sales', 'products:read'],
    ['finance', 'invoices:read'], ['finance', 'expenses:read'], ['finance', 'vendors:read'],
    ['production', 'orders:read'], ['logistics', 'compliance:read'],
    ['procurement', 'samples:read'], ['marketing', 'analytics:read'],
    ['admin', 'expenses:read'], ['owner', 'reports:pnl'],
  ];
  const CANNOT: [MembershipRole, Permission][] = [
    // Sales must not see the cost side — that's the margin.
    ['sales', 'expenses:read'], ['sales', 'invoices:read'], ['sales', 'reports:pnl'],
    // Nor the member list: 'members:invite' is the users-screen gate.
    ['sales', 'members:invite'], ['viewer', 'members:invite'], ['finance', 'members:invite'],
    // Viewer is read-only and narrow.
    ['viewer', 'expenses:read'], ['viewer', 'vendors:read'], ['viewer', 'reports:pnl'],
    // Marketing sees aggregates, not the commercial record.
    ['marketing', 'customers:read'], ['marketing', 'quotes:read'], ['marketing', 'invoices:read'],
    // ops_admin is deliberately excluded from the expense ledger and P&L.
    ['ops_admin', 'expenses:read'], ['ops_admin', 'reports:pnl'],
    // Production/logistics have no finance reach.
    ['production', 'invoices:read'], ['logistics', 'expenses:read'],
    // External portal identities read nothing.
    ['customer', 'quotes:read'], ['vendor', 'orders:read'], ['customer', 'invoices:read'],
  ];

  for (const [role, perm] of CAN) {
    assert.equal(hasPermission(role, perm), true, `${role} should be able to ${perm}`);
  }
  for (const [role, perm] of CANNOT) {
    assert.equal(hasPermission(role, perm), false, `${role} must NOT be able to ${perm}`);
  }

  // A role that can write something must be able to read it, or the UI deadlocks: you can submit
  // a change you cannot then see.
  const PAIRS: [Permission, Permission][] = [
    ['customers:write', 'customers:read'], ['leads:write', 'leads:read'],
    ['quotes:write', 'quotes:read'], ['orders:write', 'orders:read'],
    ['invoices:write', 'invoices:read'], ['expenses:write', 'expenses:read'],
    ['vendors:write', 'vendors:read'], ['products:write', 'products:read'],
    ['tasks:write', 'tasks:read'], ['compliance:write', 'compliance:read'],
    ['hs_codes:write', 'hs_codes:read'], ['incentives:write', 'incentives:read'],
    ['inbox:write', 'inbox:read'],
  ];
  for (const role of Object.keys(ROLE_PERMISSIONS) as MembershipRole[]) {
    for (const [write, read] of PAIRS) {
      if (hasPermission(role, write)) {
        assert.equal(hasPermission(role, read), true, `${role} can ${write} but cannot ${read}`);
      }
    }
  }
}

// ── Part 3: the suspension matrix ────────────────────────────────────────────
// The billing lifecycle walks trial → active → past_due → suspended → pending_deletion → deleted.
// Before the gate existed, `tenant.status` was passed to the UI shell only: a suspended tenant's
// pages were still rendered server-side and merely covered by a lock screen.
{
  const ALL: TenantStatus[] = ['trial', 'active', 'past_due', 'suspended', 'pending_deletion', 'deleted'];
  const WORKING: TenantStatus[] = ['trial', 'active', 'past_due'];
  const LOCKED: TenantStatus[] = ['suspended', 'pending_deletion', 'deleted'];

  // Sanity: the two sets together are the whole enum, so a new status can't be silently unhandled.
  assert.deepEqual([...WORKING, ...LOCKED].sort(), [...ALL].sort(), 'every TenantStatus must be classified');

  for (const status of WORKING) {
    assert.equal(isTenantAccessBlocked(status), false, `${status} is a working tenant`);
    assert.equal(isTenantAccessBlocked(status, true), false, `${status} stays open with allowSuspended`);
  }
  // past_due is explicitly NOT blocked — it's a paying customer being dunned, and locking them out
  // on day one of a failed card would be a self-inflicted churn event.
  assert.equal(isTenantAccessBlocked('past_due'), false, 'past_due must keep working');

  for (const status of LOCKED) {
    assert.equal(isTenantAccessBlocked(status), true, `${status} must deny app access`);
  }

  // allowSuspended is the way *out* of a lock: billing (pay up) and data export (DPDP right).
  assert.equal(isTenantAccessBlocked('suspended', true), false, 'owner can still reach billing');
  assert.equal(isTenantAccessBlocked('pending_deletion', true), false, 'owner can still export data');
  // …but it never resurrects a deleted workspace.
  assert.equal(isTenantAccessBlocked('deleted', true), true, 'deleted is blocked even with allowSuspended');

  // Default argument must behave as the strict case — a caller that forgets the flag gets the lock.
  for (const status of ALL) {
    assert.equal(isTenantAccessBlocked(status), isTenantAccessBlocked(status, false), `${status}: default must equal explicit false`);
  }
}

console.log('✓ read-permissions: action authorization coverage, role read matrix, suspension matrix');
