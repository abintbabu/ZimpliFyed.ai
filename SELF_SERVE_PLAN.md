# Zimplifyed.ai — Self-Serve Signup, Organizations & Unified-Login Roadmap

Companion to `PRODUCT_PLAN.md` (what the product is) and `MIGRATION_PLAN.md` (the port). This document governs **how anyone in the world signs up, creates an organization, brings their team, and sees a role-shaped product on a single login** — the standard B2B SaaS self-serve model (Slack/Linear/Notion pattern), adapted to what's already built.

**Baseline (Jul 2026, verified against code):**
- ✅ next-auth v5 + Google provider; `signIn` callback consumes pending `Invite` rows into `Membership`.
- ✅ `Tenant` (plan/status/stripe fields), `Membership` (`@@unique([userId, tenantId])`), `Invite` models.
- ✅ Edge-safe subdomain slug resolution (`tenant-resolver.ts`) → `getTenantContext` server-side.
- ✅ 11 roles + `Permission` matrix in `src/lib/permissions.ts`; invite/role UI at `/dashboard/users`.
- ✅ Marketing `/signup` page (Google button only — no org creation behind it yet).
- ❌ No org-creation flow, no onboarding wizard, no tenant switcher, no role-gated nav, no super-admin console, no billing, no email provider fallback, no lifecycle (suspend/delete/export).

---

## 1. Core architecture decisions (locked)

### 1.1 One user, many organizations — single login
- `User` is **global** (one row per human, keyed by email). `Membership` binds a user to a tenant with exactly one role. A person can belong to N orgs (their company + a consultant's client orgs).
- **Single session, active-tenant pointer.** The JWT carries `userId` + `activeTenantId` + `role` (role is *derived per tenant* — re-read from Membership in the JWT callback whenever `activeTenantId` changes, and refresh on a short interval so role changes propagate without re-login).
- **Tenant switching** = update `activeTenantId` in the session (server action → `unstable_update` / re-issue JWT), not a re-login. Topbar tenant switcher lists the user's memberships.

### 1.2 URL strategy: path-first, subdomain-optional
- Primary: `app.zimplifyed.ai/dashboard/...` with tenant from **session**, not URL. This is what makes "unified experience on single login" work — no cross-subdomain cookie pain, one deploy, ⌘K works across everything the user can see.
- Keep `{slug}.zimplifyed.ai` as a **vanity/deep-link layer** (already built): middleware resolves the slug and, if the session user has a membership there, sets it as `activeTenantId`; if not, show a "request access" page (never a data leak, never a 500).
- Tokenized guest surfaces (`/track/[token]`, future `/vendor-portal`) stay session-free — buyers/vendors never need accounts (per PRODUCT_PLAN §3).

### 1.3 Roles: two layers, don't conflate them
- **Platform layer (new):** `User.platformRole: user | staff | platform_admin`. `platform_admin` = Zimplifyed employees; sees the internal admin console (§6). Never derivable from any tenant role.
- **Tenant layer (exists):** `MembershipRole`. Rename semantics: the tenant-level `super_admin` becomes **`owner`** (the person who created the org or was transferred ownership; billing + delete rights; there is always ≥1). `admin` keeps `users:manage`/`roles:manage` but not billing/delete/transfer. Keep the DB enum value for now, relabel in UI; migrate the enum when convenient.
- Everything the UI shows/hides derives from `ROLE_PERMISSIONS` — **never** from role names in components. Add missing permission verbs as modules grew past the matrix: `rfqs:*`, `hscodes:*`, `screening:*`, `incentives:*`, `documents:*`, `audit:read`, `billing:manage`, `settings:manage`, `copilot:use`.

### 1.4 Tenant isolation, enforced structurally
- Prisma client extension: global `where: { tenantId }` on reads + write-stamp on creates for every tenant-scoped model (the Postgres equivalent of anabyn's `tenantTag()`; MIGRATION_PLAN §6.3). One escape hatch (`prismaUnscoped`) reserved for platform-admin code paths and cron.
- Server Actions never accept `tenantId` from the client. `getTenantContext()` is the only source.
- Per-permission guard at the top of every action: `await requirePermission('quotes:write')` → throws structured `{ error: 'forbidden' }`.
- Tests: a cross-tenant read/write attempt test per action file (cheap, catches the worst bug class this product can have).

---

## 2. The self-signup & onboarding flow (Phase A)

### 2.1 Sign-up paths (all land in one resolver)
After auth completes (Google today), a single `resolvePostAuthDestination()` decides:
1. **Has pending invite(s)** → consume → land in that org's dashboard (exists; keep).
2. **Has membership(s)** → land in last-active org (persist `User.lastActiveTenantId`).
3. **Verified-domain match (new, big activation lever):** if their email domain matches a tenant with `autoJoinDomain` verified (e.g. `@alnoor-trading.com`) → show "Join Al Noor Trading" (role: `viewer` by default, admin-approvable) **or** "Create a new organization".
4. **Nobody knows them** → org-creation wizard.

### 2.2 Org-creation wizard (the "aha in 5 minutes" screen)
Single page, 4 fields + AI assist:
- Company name → auto-suggest slug (editable, uniqueness-checked live).
- Business type: **Merchant exporter / Manufacturer / Both** → seeds which modules are pinned in nav and which demo data is loaded (maps to PRODUCT_PLAN personas).
- What do you export? (free text → AI suggests HS chapter, pre-warms HS-code cache) + primary markets (multi-select → seeds compliance checklist: CEPA for UAE, etc.).
- Team size (analytics only).
Creates: `Tenant` (status `trial`, plan `free`), `Membership(role: owner)`, seeded demo data (flagged `isDemo: true`, one-click "clear demo data"), default compliance items (IEC, AD code, LUT with renewal dates blank → onboarding checklist asks for them).

### 2.3 Onboarding checklist (persistent card on dashboard until done)
1. Add your IEC / GST / AD code (unlocks doc generator later)
2. Invite a teammate
3. Create your first quote (activation metric from PRODUCT_PLAN §7: quote within 24h)
4. Import leads (paste emails / CSV / connect sources later)
5. Ask Copilot anything
Each step deep-links; dismissible; completion tracked per-tenant for the activation funnel.

### 2.4 Email/password + magic link (don't stay Google-only)
Google-only blocks a chunk of Indian SMB users on custom domains without Workspace. Add next-auth **Resend/SMTP email (magic link)** provider first (no password storage, verifies email for the domain-join feature for free), credentials-with-password only if customers demand it. Account linking: same verified email = same `User` regardless of provider.

**Exit criteria Phase A:** a stranger can go from `zimplifyed.ai` → Google or magic link → org created → demo-data dashboard → invite teammate → teammate lands in same org, all with zero human involvement.

---

## 3. Team & roles experience (Phase B)

### 3.1 Invites, hardened
- Current: email-row invites consumed at sign-in. Keep, and add: **invite links** (tokenized URL with role + expiry + max-uses — the "share to WhatsApp" growth loop that matters in India), resend/expire (7-day default), pending-invite count badge.
- Bulk invite (paste emails, one role picker).
- Domain auto-join (§2.1.3) with admin toggle: off / join-as-viewer / require-approval. Domain verified via DNS TXT **or** simply "3+ existing members share it".

### 3.2 What each role actually sees (the "different users see it" requirement)
Navigation is generated from the permission matrix, not hardcoded. Concretely (using PRODUCT_PLAN §3 sidebar groups):

| Role | Default landing | Sees | Notable hides |
|---|---|---|---|
| owner / admin | Founder dashboard (daily brief) | everything + Team, Billing, Settings, Audit | — |
| sales | Leads | SELL group, Orders (read), Vendors (read), Tasks | MONEY, Compliance write, Audit |
| finance | Invoices/receivables | MONEY group, Orders (read), Vendors, Compliance | Leads write, RFQ awarding |
| procurement | Vendor RFQs | SOURCE group, Orders (read), Samples | MONEY, SELL write |
| logistics/ops | Shipments | SHIP group, Orders (write), Docs, Compliance (read) | MONEY, Leads |
| production | Production board | EXECUTE group, Tasks | everything commercial |
| viewer (e.g. CA/auditor) | Analytics | read-everything per matrix | all writes |
| vendor / customer | never see `/dashboard` | portal / token surfaces only | — |

Rules:
- Hidden ≠ protected: every server action + page does its own `requirePermission`; nav hiding is UX, guards are security.
- **Role-aware dashboard**: the `/dashboard` home renders widgets by permission (founder brief for owner, "my pipeline" for sales, "receivables aging" for finance). This is cheap and is what makes the single product feel role-tailored.
- Field-level redaction where roles overlap: sales sees orders but **not** vendor cost / margin columns unless `margins:read` (new permission — merchant traders guard buy prices even from their own sales staff; this is a real differentiator for the persona).
- Record-level assignment (later, Phase D): "sales reps see only their assigned leads" via `assignedToUserId` + a per-tenant toggle.

### 3.3 Custom roles (defer, but don't paint into a corner)
The 11 fixed roles cover SMBs. Keep `ROLE_PERMISSIONS` as the default map, but read effective permissions through one function (`getEffectivePermissions(membership)`) so a future `TenantRole` table (custom role → permission set, Business/Enterprise plans) slots in without touching call sites.

**Exit criteria Phase B:** owner invites 5 people across 4 roles; each lands on a different default page with correctly filtered nav; a demoted user loses access within one session-refresh interval without re-login.

---

## 4. Billing & plans (Phase C)

Stripe (fields already on `Tenant`; `src/lib/stripe.ts` portable per MIGRATION_PLAN §6.4).

- **Free** — 2 seats, core CRM + quotes/invoices, 20 AI actions/mo, Zimplifyed branding on buyer-facing docs/links.
- **Starter (per-org flat)** — 5 seats, full quote-to-cash, doc generator, 200 AI actions.
- **Business (per-seat)** — unlimited modules, compliance vault, LC advisor, screening, custom roles, WhatsApp notifications, remove branding.
- **Enterprise (sales-assisted later)** — SSO (SAML/OIDC via WorkOS when first real demand appears — don't build now), audit export, DPA.

Mechanics: 14-day Business trial on signup (status `trial` exists) → auto-downgrade to Free (never lock data; read-only over-limit). Plan gating one helper: `requireFeature('doc_generator')` → upsell screen, not error. Checkout + customer portal + webhook route (`checkout.session.completed`, `customer.subscription.updated/deleted` → update `Tenant.plan/status`). Seat enforcement at invite time. GST invoice details for Indian customers (Stripe Tax w/ India GST or manual field on receipts).

**Exit:** self-serve card upgrade/downgrade with zero human touch; dunning handled by Stripe.

## 5. Tenant lifecycle & trust (Phase C, parallel)

- **States:** `trial → active → past_due → suspended → pending_deletion → deleted`. Suspended = owner sees billing page only, members see friendly lock screen; data intact 60 days; deletion = 7-day grace, then hard cascade + storage purge, audit stub retained.
- **Ownership transfer** (owner → member, confirm both sides) and **leave org** (blocked for last owner). Org rename/slug change (redirect old slug 30 days).
- **Data export:** owner self-serve — CSV per module + JSON dump + zip of documents. Builds trust to sign up; legally required in many buyer geographies.
- Security table stakes on the roadmap, sequenced: rate-limit auth + invite endpoints (Phase A), session revocation on role change/removal (Phase B), audit log already exists → surface auth events in it (Phase B), 2FA optional (Phase D), data residency single-region documented (now).

## 6. Platform super-admin console (Phase D) — `admin.zimplifyed.ai`
For Zimplifyed staff (`platformRole`), not tenant owners: tenant list w/ plan/MRR/health (activation checklist %, WAU, modules used), **support impersonation** ("view as tenant", read-only default, every access audited + visible to the tenant), feature flags per tenant (gradual rollouts), AI usage/cost per tenant, abuse controls (suspend, slug reclaim), signup analytics funnel.

## 7. Growth surface (Phase E, product-led)
- Every buyer-facing artifact is a signup channel: tracking links, quote-accept pages, PDFs → "Powered by Zimplifyed" (removed on paid).
- Vendor flywheel: a vendor invited to quote in one tenant's RFQ later converts to their own exporter tenant — `vendor` memberships and exporter orgs already coexist on one User.
- Referral credits (AI actions), template gallery (public quote/doc templates), SEO play on exporter-tooling keywords (the anabyn playbook, applied to SaaS keywords).

---

## 8. Execution order & how this interleaves with PRODUCT_PLAN phases

PRODUCT_PLAN Phases 0–2 are largely built (modules exist through compliance/screening/LC/incentives). This plan's phases slot in as the **platform track** alongside the remaining product track (PRODUCT_PLAN Phases 3–5):

| Sprint | Platform track (this doc) | Product track (PRODUCT_PLAN) |
|---|---|---|
| 1–2 | **A**: post-auth resolver, org wizard, seeding, onboarding checklist, magic-link provider, rate limiting | polish existing modules' empty states (wizard lands here) |
| 3–4 | **B**: permission-verb expansion, generated nav, role dashboards, invite links + bulk, tenant switcher, session refresh | Phase 3 money intelligence (P&L, founder brief — feeds role dashboards) |
| 5–6 | **C**: Stripe plans + gating, lifecycle states, data export | Phase 3 cont. |
| 7–8 | **D**: platform admin console, impersonation, feature flags, margin-redaction, record-level assignment | Phase 4 manufacturer depth |
| 9+ | **E**: growth loops, domain auto-join polish, custom roles, SSO-on-demand | Phase 4–5 |

**Sequencing rationale:** signup before billing (nothing to bill without tenants), roles/nav before public launch (first impressions of "role-shaped product" are the pitch), platform console after ~10 real tenants exist (until then, psql is your admin console).

## 9. Success metrics (extends PRODUCT_PLAN §7)
- Signup → org created ≥ 70%; org → first quote in 24h ≥ 40% (activation).
- Invited teammate acceptance ≥ 60%; orgs with ≥3 active roles by week 4 (the "unified multi-role" bet, measurable).
- Trial → paid ≥ 8%; support tickets about "can't see X" ~0 (role UX clarity).
- Zero cross-tenant data incidents (structural isolation + tests, §1.4).

## 10. Edge cases checklist (design reviews must cover)
Invited email ≠ Google account email casing/aliases · user in 2 orgs with different roles switches mid-form · owner deletes account (block: transfer first) · invite to email that already has membership (no dup, `@@unique` exists) · slug collisions with reserved words (`app`, `admin`, `www`, `api`, `track`) · demo-data leaking into exports/analytics (filter `isDemo`) · role downgraded while a builder page is open (server action rejects; client shows re-auth toast) · webhook retries double-applying plan changes (idempotency keys) · vendor invited as staff by mistake (role change flow) · trial expiry mid-quote (grace: finish the artifact, then gate).
