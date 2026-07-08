# Spec: Self-Signup & Onboarding (SELF_SERVE Phase A)

Build-level spec for SELF_SERVE_PLAN §2. Target: a stranger goes from `zimplifyed.ai` → working org with demo data → invited teammate, zero human involvement. Grounded in current code: next-auth v5 Google (`src/auth.ts`), `Tenant`/`Membership`/`Invite` models, invite consumption in the `signIn` callback, `tenant-resolver.ts` slug logic, `/signup` page (Google button only).

---

## 1. Schema changes (one migration)

```prisma
model User {
  // add:
  lastActiveTenantId String?
  platformRole       PlatformRole @default(user)   // user | staff | platform_admin
}

model Tenant {
  // add:
  businessType   BusinessType?  // merchant | manufacturer | both
  exportProducts String?        // free text from wizard
  primaryMarkets String[]       // ISO country codes
  teamSizeBand   String?        // "1-5" | "6-20" | "21-50" | "50+"
  autoJoinDomain String?        // verified email domain for §4.3
  autoJoinMode   AutoJoinMode @default(off) // off | as_viewer | require_approval
  onboarding     Json?          // checklist state {step: doneAt}
}
```
Also: `isDemo Boolean @default(false)` on every seedable model (Lead, Vendor, Quote, Invoice, Order, Task, CostSheet). Reserved slugs constant: `['app','admin','www','api','track','signup','login','dashboard','vendor-portal','docs','status','help']`.

## 2. Post-auth resolver (the routing brain)

New: `src/lib/post-auth.ts` → `resolvePostAuthDestination(user): Promise<Destination>`; called from a single `/welcome` route that every sign-in redirects to (change next-auth `redirect` callback → `/welcome`).

Priority order (first match wins):
1. **Pending invites for email** → consume ALL (current callback consumes; move logic here so it also runs for magic-link), set `lastActiveTenantId` to the newest, → `/dashboard`.
2. **Existing memberships** → `lastActiveTenantId` if still a member, else most recent membership → `/dashboard`.
3. **Domain match**: tenant where `autoJoinDomain = emailDomain(user.email)` AND mode ≠ off AND domain not in free-mail list (gmail, yahoo, outlook, proton, rediff…) → `/welcome/join?tenant=slug` (choice screen: join vs create).
4. **Else** → `/welcome/create` (wizard).

Edge rules: invite email matching is case-insensitive + trims; Gmail dot/plus aliases NOT normalized (invite the exact address; document in invite UI). A user hitting `{slug}.zimplifyed.ai` without membership → `/no-access` (exists) with "request access" button that notifies tenant admins (creates a Notification/Task, no email in v1).

## 3. Org-creation wizard — `/welcome/create`

Single page, client island, one server action `createOrganization(input)`.

**Fields & validation (Zod):**
- `companyName` string 2–80 → live slug suggestion `slugify(name)`; slug editable, `^[a-z0-9-]{3,40}$`, not reserved, uniqueness via debounced action `checkSlug`.
- `businessType` radio: Merchant exporter / Manufacturer / Both.
- `exportProducts` free text ≤200 (placeholder "e.g. cotton towels, bathrobes") — **AI assist (fire-and-forget, non-blocking):** after create, a background call suggests HS chapters → pre-warms `HsCode` rows for the tenant; wizard never waits on AI.
- `primaryMarkets` multi-select (searchable country list, max 5).
- `teamSizeBand` select (analytics only).

**Server action transaction:**
1. Guard: authed user; **max 3 owned tenants per user** (abuse valve; platform_admin exempt).
2. Create `Tenant` (status `trial`, plan `free`, wizard fields), `Membership(role: super_admin /* UI label: Owner */)`.
3. Seed (§5) inside same tx where cheap; heavy seed rows can follow in a post-tx step keyed idempotently by tenantId.
4. Set `lastActiveTenantId`; audit entry `tenant.created`.
5. Redirect `/dashboard?welcome=1`.

Rate limit: 3 org-creations /user /day; 10 /IP /day (see §7).

## 4. Join flows

**4.1 Invite links (extends Invite):** add `token String? @unique`, `expiresAt DateTime?`, `maxUses Int?`, `useCount Int @default(0)`, make `email` nullable (link invites have no email). `/join/[token]` → if valid & authed: create membership (respect `@@unique([userId, tenantId])` — already-member is a no-op success), increment count; if not authed: stash token in cookie → auth → resolver step 0 checks cookie before step 1. Revoke = delete row (UI exists for email invites; extend).
**4.2 Bulk invite:** textarea, parse/dedupe emails, one role, cap 50/batch.
**4.3 Domain auto-join:** admin settings toggle. Verification v1 = "3+ existing members share the domain" (computed); DNS TXT verification deferred to Phase B. `require_approval` mode creates a pending-approval row surfaced on `/dashboard/users`.

## 5. Demo seed data (per businessType)

Flagged `isDemo: true`; "Clear demo data" button (settings + dashboard banner) = one action deleting all `isDemo` rows for tenant. Contents (merchant variant; manufacturer swaps vendor RFQs for production-ish tasks):
- 3 Leads (stages: new / quoted / negotiating; realistic names "Al Noor Trading LLC, Dubai")
- 2 Vendors + 3 VendorRates (+tiers) · 1 VendorRfq with 2 invited vendors, 1 quote received
- 1 CostSheet (complete build-up) · 2 Quotes (draft, sent) · 1 Order (in_production) with 1 buyer-track link + 2 milestones · 1 Invoice (sent, part-paid)
- 3 ComplianceItems seeded **real not demo** (IEC, AD code, LUT — blank expiry, checklist asks to fill) · 4 Tasks
- Analytics/exports MUST filter `isDemo` (add to shared query helpers, not per-page).

## 6. Onboarding checklist

`Tenant.onboarding` JSON: `{ complianceIds: ts?, teammateInvited: ts?, firstQuote: ts?, leadsImported: ts?, copilotUsed: ts? }`. Computed server-side by cheap existence queries on first load, then stamped (don't recompute forever). Dashboard card (dismissible, reappears via settings) with deep links: `/dashboard/compliance` · `/dashboard/users?invite=1` · `/dashboard/quotes/new` · `/dashboard/leads?import=1` · copilot. Emits `onboarding.step_completed` events (metering/analytics, AI_PLATFORM_SPEC §5).

## 7. Auth hardening (in-scope for Phase A)

- **Magic-link provider:** next-auth Resend (or Nodemailer/SES) email provider; `/login` + `/signup` get an email field under the Google button. Same email = same User (PrismaAdapter default) — account linking works because email provider verifies ownership.
- **Rate limiting:** small `RateLimit` table (or Upstash later): keys `signin:{ip}`, `invite:{tenantId}`, `orgcreate:{userId|ip}`, `sluggcheck:{ip}`; sliding window; return structured `{error:'rate_limited', retryAfterSec}`.
- Session: JWT strategy; add `activeTenantId` + `role` to token in `jwt` callback (read Membership); `session` callback exposes both. **Re-read role when `token.roleRefreshedAt > 15min`** — this is the demotion-propagation mechanism SELF_SERVE Phase B relies on; build the hook now.

## 8. Files touched (build checklist)
- [ ] migration: user/tenant fields, invite token fields, isDemo flags, RateLimit
- [ ] `src/lib/post-auth.ts` + `/welcome` route + `/welcome/create` + `/welcome/join`
- [ ] `src/actions/onboarding.ts`: createOrganization, checkSlug, clearDemoData, checklist stamp
- [ ] `src/actions/users.ts`: invite-link create/revoke, bulk invite
- [ ] `src/lib/seed-demo.ts` (port pattern from anabyn `seed-demo.ts`)
- [ ] `auth.ts`: email provider, redirect→`/welcome`, jwt/session claims, move invite-consumption to resolver
- [ ] `/join/[token]` page · settings: domain auto-join card · dashboard: checklist card + demo banner
- [ ] ToS + Privacy real pages (legal track) — signup links fixed
- [ ] tests: resolver priority matrix (7 cases), slug reserved/collision, cross-tenant seed isolation, invite-link expiry/max-use, rate limits

## 9. Acceptance criteria (demo script)
Fresh Google account → signup → wizard (invalid slug rejected live) → dashboard shows demo data + checklist → invite teammate by link via WhatsApp → teammate (magic link, non-Google) lands in same org as `sales` → owner clears demo data → analytics shows zeros → 4th org creation blocked politely.
