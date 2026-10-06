# Multi-tenancy & Team Safety — QA test cases

Manual test cases for the question "can a team sign up and start using this safely?". Run these before any release that touches auth, roles, invites, billing status, or the read actions.

Most cases also have automated coverage, named in the **Auto** column. Where a case says *manual only*, no test can reach it — it needs a browser, a real session cookie, or a second machine.

**Legend** — Priority: **P0** a bug here leaks data or strands a workspace; **P1** breaks a team workflow; **P2** polish.

---

## 0. Setup

```bash
# 1. Local test database (one-time)
psql -h 127.0.0.1 -p 5432 -d postgres -c "CREATE DATABASE zimplifyed_qa"
npx prisma db push --url "postgresql://$USER@127.0.0.1:5432/zimplifyed_qa" --accept-data-loss

# 2. Fixture data
DATABASE_URL="postgresql://$USER@127.0.0.1:5432/zimplifyed_qa" npm run seed:team

# 3. Run the app against it
DATABASE_URL="postgresql://$USER@127.0.0.1:5432/zimplifyed_qa" ALLOW_DEV_TENANT_FALLBACK=1 npm run dev
```

Tenant hosts resolve from the `Host` header. Either use `*.localhost` (Chrome and Safari resolve these automatically) or add `/etc/hosts` entries:

| Workspace | URL | State |
|---|---|---|
| Acme Exports | `http://acme-exports.localhost:3000` | active, growth plan, 6 members |
| Rival Textiles | `http://rival-textiles.localhost:3000` | active, **single owner** |
| Lapsed Traders | `http://lapsed-traders.localhost:3000` | **suspended** |

**Logins** — all use password `Fixture@123`:

| Email | Role |
|---|---|
| `owner@acme-exports.test` | Owner |
| `admin@acme-exports.test` | Admin |
| `ops@acme-exports.test` | Ops Admin |
| `sales@acme-exports.test` | Sales |
| `finance@acme-exports.test` | Finance |
| `viewer@acme-exports.test` | Viewer |
| `owner@rival-textiles.test` | Owner (only owner) |
| `owner@lapsed-traders.test` | Owner (suspended workspace) |

> Reset between runs with `npm run seed:team -- --clear` then `npm run seed:team`.

---

## 1. Tenant isolation (P0)

| ID | Case | Steps | Expected | Auto |
|---|---|---|---|---|
| **TI-01** | Member of A cannot load B | Sign in as `owner@acme-exports.test`. Navigate to `http://rival-textiles.localhost:3000/dashboard`. | Redirected to `/no-access`. No Rival data rendered. | `team-safety-live` #1 |
| **TI-02** | Read action cannot be aimed at another tenant | Signed in to Acme, open DevTools → Network. Copy the `Next-Action` header and payload from any dashboard POST. Replay it with `curl`, adding Rival's tenant id to the payload array. | Error response. No Rival rows in the body. Read actions take no `tenantId` argument, so there is nothing to aim. | `tenant-isolation` invariant D |
| **TI-03** | Session cookie from A replayed against B's host | Copy the `authjs.session-token` cookie from the Acme session. Request `http://rival-textiles.localhost:3000/dashboard` with it. | `/no-access`. Membership is checked against the DB per request, not from the token. | `team-safety-live` #1 |
| **TI-04** | Same demo data on both sides is not confused | Both fixtures seed identically-named records. In Acme, open Orders and note the order number. | Only Acme's row appears; counts match Acme's own seed, not the sum. | `integration/features` #6 |
| **TI-05** | Document download is tenant-scoped | As Acme owner, upload a file to an order. Copy its document id. Sign in as Rival owner and call `getDocumentDownloadUrl` with that id. | "Document not found". No signed URL issued. | *manual only* |
| **TI-06** | Deleted tenant stops authorizing | Delete a throwaway tenant row directly in SQL while a member is signed in. Reload. | `/no-access`; memberships cascade-deleted. | `team-safety-live` #8 |

---

## 2. Offboarding & role changes (P0)

| ID | Case | Steps | Expected | Auto |
|---|---|---|---|---|
| **TM-01** | Remove a member | As Acme owner → `/dashboard/users`. Click **Remove** on Viewer, then **Confirm**. | Row disappears. An audit entry is written. | `team-safety-live` #2 |
| **TM-02** | Removal ends access on the next request | Keep a second browser signed in as `viewer@acme-exports.test` **before** TM-01. After removing them, reload their tab. | Immediately `/no-access` — not after a delay. This is the point of reading membership from the DB. | `team-safety-live` #2 |
| **TM-03** | Removal clears a pending re-invite | Invite `viewer@acme-exports.test`, then remove their membership before they accept. | The pending invite is gone from the list; the removal can't be undone by a stale invite. | `team-safety-live` #3 |
| **TM-04** | Last owner cannot be demoted | As `owner@rival-textiles.test` → `/dashboard/users`. Change your own role to Viewer. | Refused inline: "This is the only owner. Make someone else an owner first." Dropdown reverts. | `team-guards`, `team-safety-live` #4 |
| **TM-05** | Last owner cannot be removed | Same workspace. Click **Leave** → **Confirm** on yourself. | Same refusal, shown next to the button. | `team-guards` |
| **TM-06** | Demotion allowed once a second owner exists | In Acme, promote Admin to Owner, then demote the original owner to Viewer. | Both succeed. | `team-safety-live` #4 |
| **TM-07** | Role change takes effect immediately | Sign in as Sales in a second browser. As owner, change Sales → Viewer. Reload the Sales tab and try to create a quote. | The create control is gone; the action is refused. | `team-safety-live` #5 |
| **TM-08** | Admin cannot touch an owner | As `admin@acme-exports.test`, try to re-role or remove the Owner. | "Only an owner can…" Both paths refused. | `team-guards` |
| **TM-09** | Self-removal works when not the last owner | In Acme (two owners), click **Leave** → **Confirm** as one of them. | Removed; redirected out of the workspace. | `team-guards` |
| **TM-10** | Role dropdown offers only real team roles | Open the role dropdown on any member. | `Customer`, `Vendor`, `Super Admin` are **absent**. Picking one used to lock the member out silently. | `team-guards` |

---

## 3. Roles & permissions (P0/P1)

| ID | Case | Steps | Expected | Pri | Auto |
|---|---|---|---|---|---|
| **RP-01** | Sales cannot reach the members screen | As Sales, open `/dashboard/users`. | Redirected to `/dashboard`. | P0 | `read-permissions` |
| **RP-02** | Sales cannot read the expense ledger | As Sales, open `/dashboard/expenses`; then replay `listExpenses` directly. | Page redirects; the action throws a permission error. The second half is the one that used to pass. | P0 | `read-permissions` |
| **RP-03** | Sales cannot read invoices or P&L | As Sales, replay `listInvoices`. | Permission error. | P0 | `read-permissions` |
| **RP-04** | Admin can invite, cannot touch billing | As Admin: invite a teammate (works); open `/dashboard/settings/billing`. | Invite succeeds. Billing shows "Only the workspace owner…". | P0 | `permissions` |
| **RP-05** | Ops Admin has no expense or P&L reach | As Ops Admin, open `/dashboard/expenses`. | Redirected. | P1 | `permissions` |
| **RP-06** | Viewer is read-only | As Viewer, walk Quotes / Orders / Invoices. | Lists render; no create/edit controls anywhere. | P1 | `read-permissions` |
| **RP-07** | Finance can assign a task | As Finance, open `/dashboard/tasks` and create one. | The assignee dropdown is populated — Finance does not hold `members:invite`, so this previously broke when the member list was gated. | P1 | `read-permissions` |
| **RP-08** | Task assignee is a real user | Create a task assigned to a teammate; check `Task.assigneeUserId` in SQL against `User.id`. | It matches a real user id. The form used to submit the *membership* id. | P1 | *manual only* |
| **RP-09** | Document read follows the collection | As Sales (no `invoices:read`), call `listDocuments('invoices', <id>)`. | Permission error. | P0 | `read-permissions` |
| **RP-10** | Copilot tools respect role | As Sales, ask the Copilot for quote margins. | It declines / lacks the tool, rather than answering. | P0 | *manual only* |

---

## 4. Invites (P0)

| ID | Case | Steps | Expected | Auto |
|---|---|---|---|---|
| **IN-01** | Invite is emailed | As owner, invite a new address. | Banner says "Invite sent to …". With no `RESEND_API_KEY`, it says the email failed and to use the copy-link — and says so honestly rather than claiming success. | *manual only* |
| **IN-02** | Invite carries an expiry | After IN-01, check the Pending invites table. | An **Expires** date ~14 days out. Invites used to never expire. | `team-safety-live` #6 |
| **IN-03** | Copy link works | Click **Copy link** on a pending invite; paste it. | `http://<host>/join/<token>`, on the tenant's own host. | *manual only* |
| **IN-04** | Targeted invite accepted by the right person | Open `/join/fixture-live-targeted`, sign in as `pending@acme-exports.test`. | Seated in Acme as Sales. | `invite-redemption-live` #1 |
| **IN-05** | **Forwarded invite cannot be hijacked** | Open `/join/fixture-live-targeted` but sign in as a *different* account. | No membership granted. The invite stays live for its real recipient. | `invite-redemption-live` #2 |
| **IN-06** | Expired invite refused | Open `/join/fixture-expired`. | "This invite link is no longer valid." | `invite-redemption-live` #4 |
| **IN-07** | Exhausted link refused | Open `/join/fixture-link-used-up`. | Same refusal. | `invite-redemption-live` #5 |
| **IN-08** | Open link invite works and counts uses | Open `/join/fixture-link-open` as two different new accounts. | Both seated as Viewer; `useCount` reaches 2. | `invite-redemption-live` #6 |
| **IN-09** | Admin cannot invite an Owner | As Admin, invite someone — check the role dropdown. | `Owner` is offered but refused on submit with "Only an owner can grant the owner role". | `team-guards` |
| **IN-10** | Seat limit blocks invites | Set Acme's plan to `free` (2 seats) in SQL. Invite someone. | "Seat limit reached — upgrade your plan…". The members screen used to bypass this entirely. | *manual only* |
| **IN-11** | Replaying an invite doesn't downgrade | Promote a member to Admin, then have them re-open their original invite link. | They stay Admin. | `invite-redemption-live` #10 |
| **IN-12** | Two workspaces can invite one address | Invite the same address from Acme and Rival; accept. | Both seats granted; `/welcome` lands in one and the other is reachable. | `invite-redemption-live` #9 |
| **IN-13** | Revoke a pending invite | Click **Revoke**; then open that invite's link. | Gone from the list; link refused. | *manual only* |

---

## 5. Suspension & billing (P0)

| ID | Case | Steps | Expected | Auto |
|---|---|---|---|---|
| **SB-01** | Suspended workspace blocks the app | Sign in as `owner@lapsed-traders.test`; open `/dashboard/orders`. | Lock screen. **Check the Network tab: no order data in the response.** It used to be fetched and merely covered. | `read-permissions` |
| **SB-02** | Suspended owner can still reach billing | Same session → `/dashboard/settings/billing`. | Page loads; upgrade/portal controls work. This is the way out. | `read-permissions` |
| **SB-03** | Suspended owner can still export data | Same session → `/dashboard/settings/export`. | Export runs (DPDP data-principal right survives suspension). | `read-permissions` |
| **SB-04** | `past_due` does **not** lock | Set Acme's status to `past_due` in SQL. Reload the dashboard. | Full access; dunning notice only. Locking a dunned customer would be self-inflicted churn. | `read-permissions` |
| **SB-05** | `deleted` blocks even billing | Set a tenant's status to `deleted`. Open billing. | Refused. `allowSuspended` never unlocks `deleted`. | `read-permissions` |

---

## 6. Session & auth (P1)

| ID | Case | Steps | Expected | Auto |
|---|---|---|---|---|
| **SE-01** | Session expires | Sign in, then shift the system clock past 12h (or edit the token's `exp`). Reload. | Returned to `/login`. The default used to be 30 days. | *manual only* |
| **SE-02** | Nav reflects a role change within minutes | As owner, demote a signed-in member. Wait ~5 min, reload their tab. | Nav items for the lost role are gone (authorization is already immediate — this is the JWT catching up). | *manual only* |
| **SE-03** | Unknown host does not resolve to a tenant | Visit `http://notatenant.localhost:3000/dashboard` with `ALLOW_DEV_TENANT_FALLBACK` **unset**. | No tenant resolved; no data. Never falls back to a default workspace. | `host-classification` |
| **SE-04** | Login is rate-limited | Submit 6 wrong passwords for one address. | The 6th is refused regardless of correctness. | `rate-limit` |

---

## 7. WhatsApp webhook (P0)

| ID | Case | Steps | Expected | Auto |
|---|---|---|---|---|
| **WH-01** | Unsigned POST refused | `curl -X POST http://localhost:3000/api/inbox/whatsapp -d '{"entry":[]}'` with `WHATSAPP_APP_SECRET` set. | `401`. No inbox row. Anyone who learned a `phone_number_id` could previously inject messages. | `whatsapp-route` #1 |
| **WH-02** | Wrong-secret signature refused | Same POST with an HMAC from a different secret. | `401`. | `whatsapp-route` #2 |
| **WH-03** | Replayed signature over a new body refused | Capture a valid signature, POST a different payload with it. | `401`. | `whatsapp-route` #3 |
| **WH-04** | Valid delivery ingests to the right tenant | POST a correctly signed payload for a channel owned by Acme. | `200`; message appears in Acme's inbox only. | `whatsapp-route` #5 |
| **WH-05** | Secret unset in production fails closed | Unset `WHATSAPP_APP_SECRET` with `NODE_ENV=production`. POST anything. | `401`. | `whatsapp-route` |

---

## Running the automated coverage

```bash
npm test                  # whole offline suite, includes team-guards, read-permissions, whatsapp-route

# live, against the QA database
export QA="postgresql://$USER@127.0.0.1:5432/zimplifyed_qa"
DATABASE_URL="$QA" npx tsx --conditions=react-server src/tests/team/team-safety-live.test.ts
DATABASE_URL="$QA" npx tsx --conditions=react-server src/tests/team/invite-redemption-live.test.ts
DATABASE_URL="$QA" npx tsx --conditions=react-server src/tests/integration/features.test.ts
DIRECT_URL="$QA"   npx tsx --conditions=react-server src/tests/security/tenant-isolation-live.test.ts
```

Live tests load `.env.local` themselves, so invoke them with `npx tsx` and override the variable each one reads — `npm run <script>` lets dotenvx inject the shared Supabase URL instead.

---

## Known gaps these cases do *not* cover

Carry these into the next cycle; they are open by design, not test misses.

1. **No row-level security.** Isolation is enforced entirely in application code. A raw-SQL mistake or a direct DB connection bypasses every case above.
2. **The Prisma tenant-scope extension is dormant.** `createTenantScopeExtension` is written and tested but never wired into the exported client, so the runtime "missing scope throws" defence is not active.
3. **`SupportAccessGrant` is unwired.** Platform-admin "view as tenant" is read-only and audited, but needs no tenant approval and ignores the 72-hour cap the model defines.
4. **No `org:transfer` / `org:delete`.** The last-owner guard prevents stranding a workspace, but there is still no way to hand one over or close it.
