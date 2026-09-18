# Export OS — Master Build Plan

**Destination:** this document is written to be committed into the Zimplifyed repo as `docs/EXPORT_OS_MASTER_PLAN.md` and used as the standing brief for development.

**Repos referenced throughout**
- `Z` = `/Users/abinbabu/Desktop/Zimplifyed.ai` — the SaaS platform (Next.js 16, Prisma 7, Postgres/Supabase, next-auth v5, Stripe + Razorpay, Anthropic)
- `A` = `/Users/abinbabu/anabyn-website` — the reference implementation (Next.js 16, Firebase, single-tenant export-house ERP)

---

## 1. Context

Anabyn has spent two years encoding how a real Indian textile export house actually runs: statutory invoicing with gapless serials, FEMA realization clocks, vendor ledgers, three pricing methods, a unified Gmail+WhatsApp lead timeline, and an AI sales desk that drafts but never sends. All of it is single-tenant, Firebase-bound, and hardcoded to one company.

Zimplifyed has spent its time on the other half: multi-tenancy, dual-rail billing, entitlements and metering, a platform-admin console with impersonation, a permission-gated AI router with budgets and evals, a durable job queue, an encrypted credential vault, and a merge-blocking tenant-isolation scan.

Neither is the product. The product is Anabyn's domain depth running on Zimplifyed's platform, sold to every exporter who currently runs the same business on WhatsApp, Tally and a folder of Excel files.

**What we are building:** a multi-tenant Export OS. A company signs up, gets `theircompany.zimplifyed.ai`, invites their team, connects their mailbox and WhatsApp, loads their products, and runs enquiry → quote → order → production → shipment → statutory documents → invoice → collection → realization inside one system. We operate it, and our own super-admins can support them without seeing more than they consented to.

### 1.1 Decisions locked

| Decision | Choice | Consequence |
|---|---|---|
| Build shape | **One app, extend Zimplifyed** | No second codebase. New domain code lands in `Z/src/modules/*`. Tenancy, billing, auth, AI router are inherited, not rebuilt. |
| Tenant URL | **`{slug}.zimplifyed.ai`** | Wildcard DNS + wildcard cert. Custom domains (`erp.acme.com`) deferred to Wave 8 — the `TenantDomain` model is designed now so it is additive later. |
| Anabyn | **Becomes tenant #1** | Real migration from Firestore to Postgres, real cutover. This is the forcing function that removes every hardcoded `anabyn`. |
| Launch bar | **Full export ops** | ~30 modules. Public signup opens only when the ops spine is complete end-to-end. |
| Capacity | **Founder + Claude Code, no fixed date** | Waves are sized to be independently shippable and independently verifiable, because there is no team to parallelise across. |
| Geography | **India + UAE/GCC** | Two country packs at launch. The pack interface must be *proven*, not assumed — that is the whole point of shipping two. |
| Industry | **Generic from day one** | A spec-axis attribute engine is the core. Industry packs (textiles first) are seed data on top, not a hardcoded taxonomy. |

### 1.2 Two decisions I would push back on once, then build as specified

**"Full export ops at launch" with one builder.** This is roughly 30 modules ported onto a different database, a different auth model and a different rendering stack. Shipping it as a single launch means a very long period with no external feedback. The plan below therefore treats it as **one public launch, many internal waves, with Anabyn as the only tenant throughout.** Anabyn running its real business on each wave is the substitute for external beta feedback. If at Wave 5 the spine feels solid, opening signups early costs nothing — the waves are ordered so that every wave boundary is a shippable state.

**"Generic from day one."** The attribute engine generalises cleanly; the AI does not. Anabyn's sales agent works because it is grounded — it knows GSM, thread count, Incoterms and two ports, and `price-guard.ts` rejects any number that does not appear in that grounding. With no built-in taxonomy, a new tenant's AI has nothing to ground on and will either refuse everything or hallucinate. **Mitigation, built into the plan:** the onboarding wizard is the grounding step. It builds the tenant's spec axes, their `TenantFact` rows, their terms and their first products before the AI desk is offered, and the AI desk stays hard-disabled until a grounding-completeness threshold is met. Industry packs exist as *accelerators* for that wizard — pick "textiles" and the axes and facts are pre-filled — not as a limit on who can sign up.

---

## 2. The CXO briefs

Each seat below owns specific calls. When a decision in this document is contested, it is resolved by the seat that owns it.

### CEO — what this company is
**Mandate.** Indian and GCC exporters run a business with more statutory surface than a bank and less software than a coffee shop. We are the system of record for the whole cycle, and our moat is compliance depth that a horizontal CRM will never build.

**The calls this seat owns:** who we sell to first, when signups open, what we refuse to build.

**Positioning.** Not a CRM with invoicing bolted on. Not an accounting package. The operating system for an export business — the thing that knows a proforma is what the AD bank credits an advance against, that a commercial invoice is raised at removal of goods for the full contract value, and that money in the account without an eBRC is still an open EDPMS entry.

**Sequencing.** Anabyn is tenant #1 and stays the only tenant until the walkthrough in §13.5 passes end to end. Then five design partners from the Tirupur/Karur/Panipat clusters, hand-onboarded, free for a year, in exchange for brutal weekly feedback. Public signup after that.

**Red lines.** We do not file on a tenant's behalf. We do not give tax or legal advice. We do not touch their money. Every compliance surface carries a "verify with your advisor" disclaimer and an audit trail showing what we computed and from what.

### CTO — how it is built and kept safe
**The calls this seat owns:** topology, tenant isolation, the schema, what goes in a pack vs core.

**Non-negotiables:**
1. One app, one schema, one isolation guard (§3, §5).
2. The `DEV_TENANT_SLUG = 'demo'` fallback in `Z/src/lib/tenant-resolver.ts` is deleted before any second tenant exists. It is the single most dangerous line in the codebase.
3. Tenant isolation is three layers: the static CI scan (primary), the Prisma client extension (defence in depth), and the live two-tenant test (proof). Raw SQL is outside all three and must be annotated and separately tested.
4. Every pure domain function ports with its table test. No exceptions, no "add tests later".
5. India-specific and UAE-specific law lives in `Z/src/packs/`, never in core. Shipping two packs at launch is how we find out whether the interface is real.

**Budget rule.** AI is metered per tenant against plan entitlements before the call, not after. `Z/src/ai/budget.ts` already does this — every new flow goes through it.

### CPO — what a tenant actually experiences
**The calls this seat owns:** onboarding, the module map, what ships enabled vs off.

**The first ninety minutes.** Signup → org wizard (name, country, industry, registrations) → pick an industry pack or start generic → connect a mailbox → import products from a spreadsheet → issue one real document. If a tenant cannot reach a rendered, branded, statutorily-correct proforma in their first session, onboarding has failed.

**Progressive disclosure.** A new tenant sees six nav items (Inbox, Leads, Products, Quotes, Invoices, Settings). Production, QC, inventory, samples, procurement and finance depth unlock as they are configured or as the plan allows. Anabyn's own `docs/ADMIN-GAP-ANALYSIS.md` learned this the expensive way: ~20 sidebar items became ~10 and the product got better.

**Default-off.** AI autosend, the sales agent, and any outbound automation ship disabled and stay disabled until the tenant explicitly turns them on, with a second platform-level feature flag above that. Anabyn ships four independent kill switches; we inherit all four.

### CFO — pricing, unit economics, and the money modules
**The calls this seat owns:** plan boundaries, metering, what is an overage.

**Packaging** (extends `Z/src/lib/billing/plans.ts`, which today has free/starter/growth/enterprise):

| | Free | Solo ₹999 | Starter ₹1,499 | Growth ₹4,999 | Enterprise |
|---|---|---|---|---|---|
| Seats | 2 | 1 | 5 | unlimited | unlimited |
| Documents/mo | 5 | 30 | 100 | unlimited | unlimited |
| AI actions/mo | 20 | 100 | 200 | 1,000 | 100,000 |
| Mailboxes | 1 shared | 1 | 3 | unlimited | unlimited |
| WhatsApp | — | — | ✓ | ✓ | ✓ |
| Production/QC/Inventory | — | — | read-only | ✓ | ✓ |
| Vendor portal + RFQ broadcast | — | — | — | ✓ | ✓ |
| Custom sending domain | — | — | ✓ | ✓ | ✓ |
| AI sales desk | — | — | — | ✓ | ✓ |
| Custom domain (Wave 8) | — | — | — | ✓ | ✓ |
| SSO/SAML, audit export | — | — | — | — | ✓ |

**Overages** stay as they are: ₹199/100 AI actions, ₹99/doc-set. Metered through `MeterEvent`, which already exists.

**Unit economics rule.** Gross margin per tenant must stay above 75% after AI and storage. The `AiInteraction` cost table in `Z/src/ai/router.ts` makes this measurable per tenant from day one — build the per-tenant cost view in the platform console in Wave 5, not later.

**The money modules are not optional.** Vendor ledger, AP/AR aging, payment allocation, realization tracking and margin drift are what make this a system of record instead of a nicer inbox. They are Wave 7, and Wave 7 is not deferrable.

### CMO — how tenants arrive
**The calls this seat owns:** the acquisition surface, what the free tools are, product-led loops.

Zimplifyed already has the right instinct: `Z/src/app/(marketing)/tools/` ships three real free tools (HS finder, landed cost, LC checker) and `Z/specs/SEO_CONTENT_PLAN.md` targets programmatic pages. Anabyn proved the channel works — and also proved its limit (`seo-content-saturated-fix-sitemap` in the project memory: ~250 landing pages already exist and more pages is no longer the bottleneck).

**Product-led loops to build in, not bolt on:**
- Every buyer-facing artefact — tokenised quote, tracking page, doc-set share, digital catalogue, PDF footer — carries a subtle "Powered by Zimplifyed" that links to a landing page. The buyer of one tenant is the prospect of the next.
- The vendor portal is a free seat. A vendor invited by three tenants is a tenant.
- Free tools capture an email and offer "save this calculation to your workspace".

**Channel priority:** free tools + programmatic compliance content → WhatsApp exporter communities → CA-firm and Export Promotion Council partnerships → cluster field visits. Paid only after PLG proves a CAC.

### CISO — trust and data
**The calls this seat owns:** isolation proof, secrets, consent, incident response.

- Tenant isolation as in §5, with the live test in CI, not skipped.
- Every third-party credential in `IntegrationCredential` (AES-256-GCM envelope, `keyVersion` for rotation). Never in env, never in a JSON blob.
- DPDP: `ConsentRecord` gates every outbound WhatsApp send today; extend it to marketing email with RFC 8058 one-click unsubscribe. Consent is never inferred from a lead existing.
- Support access is consented, scoped and time-boxed (§6.3). Break-glass impersonation stays but is loud, rate-limited and double-audited.
- A public `/security` page built from `Z/specs/SECURITY_BASELINE.md`. SOC 2 Type I when the first enterprise deal demands it, not before.
- Data export (`Z/src/lib/data-export.ts` exists) must include document binaries before launch — a tenant who cannot leave will not join.

### CCO (Compliance) — the moat, and its limits
**The calls this seat owns:** what goes in a country pack, what we refuse to compute.

The India pack is well-understood because Anabyn encoded it and `A/docs/EXPORT-INVOICING-SOP.md` documents the reasoning. The UAE/GCC pack is **not** yet verified and must not be written from memory. Before Wave 2 ships, a UAE-based advisor signs off on: zero-rated export evidence requirements, TRN handling, mainland vs free-zone invoicing differences, customs declaration references, Certificate of Origin issuance via the chamber, and the current status of the UAE e-invoicing programme and Saudi ZATCA phase-2 integration for tenants shipping into KSA. Anything unverified ships behind a feature flag and is labelled provisional in the UI.

**Standing rule:** every computed compliance value carries provenance (what rule, what inputs, what version of the pack) and a `problems[]` array. We surface problems before a filing, never after. Anabyn's `toTable6ARow()` is the pattern — copy the contract, not just the code.

### CHRO / Ops — who runs this
Solo + Claude Code for now. First hires, triggered not scheduled: a support/CS person at 20 paying tenants; a compliance advisor on retainer before the UAE pack ships; a second engineer when a wave takes longer to review than to build.

---

## 3. Architecture: topology

**One repo, one Next app, three internal seams.** The repo facts that force this:

1. `Z/src/tests/security/tenant-isolation.test.ts` reads `src/actions` from `process.cwd()` and parses `prisma/schema.prisma`. A second app means a second copy of the security control, which means drift.
2. `Z/src/lib/session-tenant.ts` fuses next-auth's host-scoped session cookie with the Host-derived tenant. Two origins means two sign-ins.
3. `Z/package.json` is a single package with no workspaces. Splitting is a week of build infra for zero customer value.
4. `Z/prisma/schema.prisma` is one file with `Tenant` carrying back-relations to every scoped model.

**Seam A — module directories.** New domain code lands in `Z/src/modules/<domain>/` with four layers:
- `domain/` — pure functions. No Prisma, no `server-only`, no clock, no network. This is where every ported Anabyn library lives and where every table test points.
- `data/` — Prisma access, always tenant-scoped.
- `actions/` — thin `'use server'` wrappers, re-exported into `Z/src/actions/<domain>.ts` so the isolation scan keeps seeing them.
- `ui/` — components.

Domains: `catalogue`, `pricing`, `procurement`, `production`, `inventory`, `finance`, `engagement`, `agent`, `compliance`.

**Seam B — deployment split, not code split.** `Z/scripts/worker.ts` already runs as its own process. Web stays stateless; the worker owns sync, sweeps, document generation and AI runs.

**Seam C — host-gated route groups.** Marketing (`Z/src/app/(marketing)`), platform console (`Z/src/app/admin`) and the tenant app (`Z/src/app/dashboard`) are separated by host rules in `Z/src/proxy.ts`, not by separate apps.

**The future extraction:** `Z/src/modules/*/domain/**` has no Prisma and no React by construction, so lifting it into `packages/core` when a mobile app or public API arrives is mechanical. Design for it; do not do it now.

---

## 4. Architecture: tenancy and subdomains

### 4.1 Delete the fallback

`Z/src/lib/tenant-resolver.ts` currently ends by returning `'demo'` for any unrecognised Host. Combined with `assertTenantContext()` in `Z/src/lib/tenant.ts`, which only throws when a session tenant is *present and different*, this means a misconfigured DNS record, a preview URL, a health check or a Host-header probe reads demo-tenant data. **This is Wave 0, item 1.**

### 4.2 Pure classification, then cached lookup

**Layer 1** — `Z/src/lib/tenant-resolver.ts` becomes a total, pure classifier with no DB and no fallback:

```ts
export type HostResolution =
  | { kind: 'platform'; surface: 'marketing' | 'app' | 'admin' | 'api' }
  | { kind: 'subdomain'; slug: string }
  | { kind: 'custom'; hostname: string }      // candidate, not a grant (Wave 8)
  | { kind: 'dev'; slug: string }             // only when ALLOW_DEV_TENANT_FALLBACK=1
  | { kind: 'unknown'; hostname: string };

export function classifyHost(host: string | null | undefined): HostResolution;
```

Order: strip port → lowercase → punycode-normalise → reserved-label check (`www`, `app`, `admin`, `api`, `mail`, `static`, `cdn`, `status`, plus the reserve list in `Z/src/lib/slug.ts`) → `^([a-z0-9-]+)\.zimplifyed\.ai$` → `*.localhost` (dev only) → everything else is `custom` or `unknown`. A startup assertion in `Z/src/instrumentation.ts` throws if `ALLOW_DEV_TENANT_FALLBACK` is set in production.

**Layer 2** — `Z/src/lib/tenant.ts` resolves slug (and later hostname) to a tenant through `unstable_cache` with `revalidate: 60` and tag `tenant-domains`, invalidated on any slug or domain mutation. Returns `null` for unknown and for non-active tenants. No fallback.

### 4.3 What `Z/src/proxy.ts` becomes

Edge-safe, no DB. Four jobs:

1. **Host-agnostic bypass** for tokenised and infrastructure paths: `/quote/`, `/track/`, `/doc-set/`, `/catalogue/`, `/u/` (unsubscribe), `/api/auth/`, `/api/billing/`, `/api/inbox/`, `/api/files/`, `/_next/`, `/.well-known/`.
2. **Surface routing.** Marketing host asking for `/dashboard` → redirect to the app host. Tenant host asking for `/` → rewrite to `/dashboard`. Tenant host asking for a marketing route → 404. Unknown host → a static `/unknown-domain` page.
3. **Canonical redirect** — 308 to the primary host, preserving path and query.
4. **Headers** — `X-Robots-Tag: noindex, nofollow` on the whole tenant host, not just `/dashboard`.

Next 16 allows a Node-runtime proxy. Resist it: a DB round-trip per asset request is not worth it when `unstable_cache` in RSC is correct and cheap.

### 4.4 Slugs, and the `TenantDomain` model built now for Wave 8

Slug rules: 3–40 chars, `[a-z0-9-]`, no leading/trailing hyphen, not in the reserve list, immutable after 30 days without a platform-admin action (`slug_reclaim` already exists in `PlatformAuditAction`). A slug change issues a permanent redirect from the old host for 90 days.

`TenantDomain` (schema in §7, Migration D) ships in Wave 0 with only `platform_subdomain` rows, so the resolution path is uniform from the start and Wave 8 adds custom domains without touching the resolver.

### 4.5 Tokenised buyer pages

**A tokenised page resolves its tenant from the token, never from the host.** `Z/src/app/quote/[token]/page.tsx` already does this correctly; extend the pattern to `/track/`, `/doc-set/`, `/catalogue/` and `/u/`. Formalise it as a single sanctioned cross-tenant read:

```ts
resolvePublicToken(kind, token): Promise<{ tenantId, entityId } | null>
```

wrapped in `withPlatformScope('public-token')` and listed in the isolation exemption manifest with a reason. Tokens are ≥128 bits from `crypto.randomBytes`, revocable, rate-limited via the existing `RateLimit` model, and render branded with the token's tenant regardless of which host served them.

---

## 5. Architecture: tenant isolation

Three layers, in order of authority.

### 5.1 Layer 1 (primary) — the widened static scan

`Z/src/tests/security/tenant-isolation.test.ts` is merge-blocking and covers only `src/actions/*.ts`, non-recursive. Real blind spots today: `Z/src/lib/data-export.ts` (queries 10 models directly), `Z/src/lib/inbox/sync.ts`, `Z/src/lib/doc-engine/context.ts`, every route handler, every server component.

Widen in four steps, keeping it green throughout:
1. Recursive walk of `src/actions/**`.
2. Add `src/lib/**`, `src/app/api/**`, `src/app/**/page.tsx`, `src/app/**/route.ts`, `scripts/**`. Accept a third proof alongside `tenantId`-in-args and `// tenant-safe:` — the file wraps its work in `withTenant(` or `withPlatformScope(`.
3. Every `withPlatformScope(` call site must appear in a reviewed manifest at `Z/src/tests/security/platform-scope-allowlist.ts` with a one-line reason, and every manifest entry must still exist. Dead exemptions fail CI.
4. Add a raw-SQL invariant: every `$queryRaw`/`$executeRaw` must interpolate a `tenantId` parameter or carry an annotation.

### 5.2 Layer 2 (defence in depth) — the Prisma extension

```ts
// Z/src/lib/tenant-scope.ts
export const scopeStore = new AsyncLocalStorage<Scope>();
export function withTenant<T>(tenantId: string, fn: () => Promise<T>, supportGrantId?: string): Promise<T>;
export function withPlatformScope<T>(reason: string, fn: () => Promise<T>): Promise<T>;
```

`Z/src/lib/prisma.ts` keeps its lazy-construction behaviour (tests inject `globalThis.prisma`) and wraps at the export boundary with `$extends({ query: { $allModels: { $allOperations } } })`. For tenant-scoped models: missing scope throws; platform scope passes through; tenant scope injects.

Injection rules:
- `findMany`/`findFirst*`/`count`/`aggregate`/`groupBy`/`updateMany`/`deleteMany` → `where: { AND: [existing, { tenantId }] }`
- `findUnique*` → rewritten to `findFirst*` (Prisma's `UniqueInput` rejects a non-key field)
- `update`/`delete`/`upsert` → a `findFirst` guard inside the extension, throwing `cross_tenant_write` on miss
- `create`/`createMany` → force `data.tenantId`, throw if a different one was supplied

`TENANT_SCOPED_MODELS` is **generated** by `Z/scripts/generate-tenant-scoped-models.ts` parsing the schema, with a test asserting the generated file is in sync. A new scoped model that skips regeneration fails CI.

**Write the limits in the file header, honestly:** nested writes are not rewritten (prefer child models without `tenantId`, inheriting through the parent — `QuoteLineItem` already does this and it is the better design); raw SQL is invisible; `$transaction` is covered only when started from the extended client, so never export the base client.

### 5.3 Layer 3 (proof) — the live test

`Z/package.json` already has `test:security:live` pointing at `tenant-isolation-live.test.ts`, deferred because "the pooler hangs". Fix it with `DIRECT_URL` (Supabase direct connection, port 5432, not the 6543 pooler). The test seeds two tenants and, for every model in the *generated* list, asserts: A sees zero of B's rows; a create under A with B's `tenantId` throws; an update targeting B's row id under A's scope affects zero rows. Driving it from the generated list means new models get coverage automatically.

Postgres RLS (`SET LOCAL app.tenant_id` inside a transaction) is a fourth layer worth adding in Wave 8, after the first three have been green for a quarter.

---

## 6. Architecture: who can do what

### 6.1 Fix the naming collision first

`MembershipRole.super_admin` means *tenant owner*. `PlatformRole.platform_admin` means *us*. That is one bad code review away from a serious incident, and `Z/src/lib/permissions.ts` gives `super_admin` only two extra permissions over `admin` — nowhere near what an owner needs.

Per `Z/docs/EXPAND_CONTRACT_MIGRATIONS.md`: **expand** (add `owner`, treat identically to `super_admin` everywhere) → **backfill** (`Z/scripts/backfill-owner-role.ts`) → **contract** (drop `super_admin` with `ALLOW_SCHEMA_DROP=1` after a clean deploy cycle).

### 6.2 New permissions

Add to the `Permission` union in `Z/src/lib/permissions.ts`:

```
billing:manage · members:invite · members:remove · roles:assign
branding:manage · settings:manage · domains:manage · integrations:manage
numbering:manage · terms:manage · ai:configure
data:export · org:transfer · org:delete · support_access:grant
```

`owner` gets everything. `admin` gets everything **except** `billing:manage`, `domains:manage`, `org:transfer`, `org:delete`, `support_access:grant` — an admin runs the business; only the owner changes what we charge, where the company lives on the internet, and who else is God.

Invariants enforced in `Z/src/actions/users.ts`: at least one `owner` always (throw `last_owner`); ownership transfer is nominate → confirm → both emailed → `AuditEntry`; `org:delete` requires typing the slug, sets `pending_deletion` with a 30-day window (the lifecycle machine in `Z/src/lib/billing/lifecycle.ts` already has the state), and is reversible.

Also port Anabyn's most useful role nuance: `ops_admin` = full admin reach **minus the expense ledger and P&L**. In our matrix that is `admin` minus `expenses:*` and `reports:pnl`. It is the role an operations lead actually needs.

### 6.3 Our super-admin: two tiers of access

**Tier 1 — break-glass (exists).** `startImpersonation()` in `Z/src/actions/platform-admin.ts` plus the read-only snapshot at `Z/src/app/admin/tenants/[id]/view/page.tsx`, double-logged to `PlatformAuditEntry`. Keep it, rate-limit it, and alert the tenant owner by email every time it is used.

**Tier 2 — consented support mode (new).**

```prisma
model SupportAccessGrant {
  id String @id @default(cuid())
  tenantId String
  requestedByUserId String
  reason String
  scope SupportAccessScope @default(read_only)   // read_only | read_write
  approvedByUserId String?
  approvedAt DateTime?
  expiresAt DateTime                              // hard cap: approvedAt + 72h
  revokedAt DateTime?
  lastUsedAt DateTime?
  useCount Int @default(0)
  @@index([tenantId, expiresAt])
}
```

Flow: staff requests with a reason → every `owner` is notified in-app and by email → owner approves in `/dashboard/settings/support`, choosing scope and duration (1h / 8h / 72h max) → grant active.

`requireTenantSession()` in `Z/src/lib/session-tenant.ts` resolves in order: real membership wins → else an unexpired grant for a platform-staff user synthesises a session with `role: 'viewer'` (read_only) or `'admin'` (read_write), carrying `viaSupportGrant` → else throw.

Hard rules: `read_write` **never** grants `billing:manage`, `org:delete`, `org:transfer`, `domains:manage`, `data:export` or `support_access:grant`, enforced by a deny-list applied after role resolution. Every write under a grant stamps `AuditEntry.metadata.supportGrantId` (read from the ALS scope, so no call site has to remember). A persistent banner shows in the tenant UI for the grant's lifetime with a revoke button. A nightly sweep expires stale grants and emails the owner a summary of what was viewed and changed.

---

## 7. Data model

Four migrations. All new tenant-scoped models carry `tenantId` + `Tenant` relation with `onDelete: Cascade`, `isDemo Boolean @default(false)` where seedable, and timestamps. Pure child rows (line items) **omit** `tenantId` and inherit through their parent — matching `QuoteLineItem` and keeping the extension's nested-write limitation harmless.

`Z/prisma/migrations/` last has `20260713092544_add_expense` while the schema holds ~20 later models — `db:push` is the live workflow. Keep it; treat each migration below as one reviewed schema-diff PR gated by `npm run db:check`.

### Migration A — Catalogue, specifications, pricing, FX

```
ProductCategory      parentId self-relation, slug, name, path, sortOrder   @@unique([tenantId, slug])
SpecAxis             key, label, unit, dataType num|enum|text, options[], sortOrder, required
                     ← the generic attribute engine. GSM, thread count, size, grade, purity, tolerance —
                       all are just axes. Seeded by the industry pack, editable per tenant.
ProductVariant       productId, sku, axisValues Json, weightGrams, dimsJson, barcode, active
ProductSpecValue     productId|variantId, axisId, valueNum, valueText     ← queryable specs
PricingMethod enum   per_piece | per_kg | per_meter | per_sqm | per_unit
PricingMatrix        name, productId?, categoryId?, method, currency, basis
PricingMatrixCell    matrixId, rowAxisId, rowValue, colAxisId, colValue, rate
MarginRule           name, type default|specific, priority, condition Json, marginPct, floorPct, active
IncotermLadder       name, originPortCode, defaultCurrency, active
IncotermLadderStep   ladderId, incoterm, sortOrder, componentKey, amountType fixed|pct|per_unit, amount
FxSnapshot           base, quote, rate, basis cbic|bank|market|manual, effectiveFrom, source, capturedAt
CatalogueShare       token @unique, priceListId, buyerId?, locale, active, expiresAt, viewCount
```

Expand: `Product` + `categoryId`, `pricingMethod`, `defaultVariantId`, `netWeightGrams`, `originCountry`. `PriceList` becomes the rate list (+ `basis`, `status`, `shareToken`, `publishedAt`, `fxSnapshotId`, `locale`). `PriceListItem` + `variantId`, `method`, `moqUnit`, `leadTimeDays`, `validTo`. `Quote`/`Invoice` + `fxSnapshotId`, `fxRateToBase`, `fxBasis`, `incotermLadderId`.

### Migration B — Supply side

```
VendorCapability     vendorId, process, mode in_house|subcontract, capacityPerMonth, capacityUnit
VendorMachine        vendorId, kind, count, spec Json
VendorCertification  vendorId, kind, number, issuer, validFrom, validTo, fileKey, verified
VendorScorecard      vendorId, period, onTimePct, defectPct, priceIndex, responseHours,
                     evidenceCount, score Float?   ← null when evidenceCount = 0. Non-negotiable.
VendorRate           EXPAND: + specKey, version, supersedesId, supersededAt, sourceQuoteId
PurchaseOrder        poNumber, seriesId, type purchase|job_work, vendorId, orderId?, status, terms
PurchaseOrderLine    poId, productId?, variantId?, qty, unit, unitPrice, taxPct, receivedQty
JobWorkIssue         poId, materialProductId, qtyIssued, challanNumber, issuedAt
JobWorkReceipt       poId, qtyReceived, wastageQty, challanNumber, receivedAt
ProductionRun        orderId, vendorId?, plannedStart/End, actualStart/End, status
ProductionStage      runId, name, sortOrder, status, vendorId?, planned/actual dates, notes
QcInspection         orderId|runId, stage, aqlLevel, inspectionLevel, lotSize, sampleSize,
                     critical/major/minorFound, accept thresholds, result pass|fail|conditional
QcDefect / QcPhoto   inspectionId, code, severity, count / fileKey, caption
StockLocation        name, kind warehouse|vendor|transit|sample_room, address
InventoryItem        productId?, variantId?, locationId, unit, onHandQty, reservedQty, avgUnitCost
                     @@unique([tenantId, variantId, locationId])
StockMovement        itemId, type inbound|outbound|reserve|release|return|adjust|write_off|transfer,
                     qty, unitCost, refType, refId, occurredAt, byUserId
ParStockConfig       productId|variantId, locationId, minQty, maxQty, reorderQty, leadTimeDays
SampleRequest        buyerId?, leadId?, variantId?, spec Json, status, promisedAt, dispatchedAt,
                     courier, awb, costAmount, chargeable, feedback
SampleInventoryItem / SampleMovement / SampleLoan
Claim                kind quality|shortage|damage|delay|payment, orderId?, invoiceId?, buyerId?,
                     vendorId?, amount, status, resolution, creditNoteInvoiceId?
```

### Migration C — Money

```
NumberingSeries      key invoice|proforma|quote|po|doc_set|credit_note|receipt_voucher|sample,
                     prefix, fiscalYearMode calendar|india_fy|none, padWidth, separator,
                     declaredFloor Int, active                      @@unique([tenantId, key])
NumberingCounter     seriesId, periodKey, next Int @default(1)      @@unique([seriesId, periodKey])
Payment              direction in|out, partyType buyer|vendor, buyerId?, vendorId?, method, amount,
                     currency, fxRateToBase, fxBasis, receivedAt, reference, bankAccountId?, status
PaymentAllocation    paymentId, targetType invoice|vendor_bill|advance, targetId, amount
VendorBill           vendorId, billNumber, poId?, billDate, dueDate, amount, taxAmount, currency,
                     status, fileKey                       @@unique([tenantId, vendorId, billNumber])
RecurringInvoice     name, templateJson, buyerId, frequency, interval, nextRunAt, endsAt, status
TaxFilingExport      kind, periodStart, periodEnd, rowCount, fileKey, problems Json, generatedAt
BankAccount          label, bankName, accountNumber, ifscOrSwift, currency, adCode, isDefault
BankStatementLine    bankAccountId, valueDate, description, amount, direction, reference,
                     matchedPaymentId?, matchedRealizationId?, importBatchId
```

Expand `Invoice`: `+ seriesId`, `fiscalYear`, `cancelledAt`, `cancelledReason`, `isNilValue`, `placeOfSupply`, `lutNumber`, `lutValidTo`, `endorsementText`, `shippingBillNumber/Date/PortCode`, `ebrcNumber`, `realizedAmount`, `advanceReceivedAt`, `recurringInvoiceId`. Expand `Expense`: `+ vendorId`, `poId`, `costType production|overhead`, `productLine`, `orderId`. Expand `Vendor`: `+ openingBalance`, `paymentTermsDays`, `currency`, `portalStatus`, `vendorProfileId` merge.

`DocCounter` stays during expand; `Z/src/lib/doc-engine/numbering.ts` migrates to `NumberingSeries`/`NumberingCounter` behind a dual-read shim, then `DocCounter` contracts.

### Migration D — Config, engagement, platform

```
TenantSettings       tenantId @unique, identity/brand/docs/commercial/vocabulary/ai/email/locales Json,
                     version, updatedByUserId                          ← §8
TenantBrandAsset     kind logo|logo_dark|favicon|signature|letterhead|font, fileKey, mimeType, meta
TermsClauseSet       key, name, appliesTo[], isDefault
TermsClause          setId, key, locale, sortOrder, title, body        @@unique([setId, key, locale])
TenantFact           category, text, active, sortOrder, sourceRef      ← generalises FIXED_FACT_LINES
TenantDomain         hostname @unique, kind, status, isPrimary, verifyMethod, verifyToken,
                     providerDomainId, sslStatus, lastCheckedAt, checkAttempts   ← §4.4
SupportAccessGrant   §6.3
Integration          kind, account, displayName, status, scopes[], externalAccountId,
                     ownerUserId?, visibility tenant|owner_only, lastHealthyAt, lastError, config
                     @@unique([tenantId, kind, account])               ← non-secret twin of the vault
WhatsAppNumber       wabaId, phoneNumberId @unique, displayNumber, integrationId, status
SendingDomain        domain, provider, providerDomainId, status, dnsRecords Json, verifiedAt, isDefault
Notification         userId?, kind, title, body, linkHref, severity, readAt, dismissedAt
NotificationPref     userId, kind, inApp, email, whatsapp
MarketingContact / MarketingSegment / Campaign / CampaignSend / UnsubscribeToken
AgentPlaybookEntry   question, answer, locale, approvedByUserId, active, usageCount, version
OutboxItem           channel, threadKey, payload Json, gateDecision Json, releaseAt,
                     status queued|released|superseded|blocked, supersededByMessageId, sentAt
ApiKey / WebhookEndpoint / WebhookDelivery                             ← Wave 8
```

Expand: **`KnowledgeChunk` + `tenantId String?` and `scope pack|tenant`** — it is pack-scoped only today, and this is the blocking gap for per-tenant RAG. `InboxChannel` + `ownerUserId`, `visibility`, `integrationId`. `MembershipRole` + `owner`. `PlatformAuditAction` + `domain_reclaim`, `support_access_request|use|revoke`.

---

## 8. Configurability: nothing about one company in code

Every hardcoded Anabyn identity gets a home. The worst offenders, all confirmed in the source:

| Hardcoded today | Becomes |
|---|---|
| `A/src/lib/sales-recipients.ts` `SALES_DOC_CC` (7 addresses) | `settings.docs.ccRecipients[]` |
| `A/src/app/actions/gmail.ts` `INTERNAL_DOMAINS = ['anabyn.com']` | `settings.docs.internalDomains[]` |
| `A/src/lib/agent/playbook.ts` `FIXED_FACT_LINES` | `TenantFact` rows |
| PDF brand colours per template file | `settings.brand` + `TenantBrandAsset` |
| GSTIN in invoice-template seeding | `Tenant.gstin` / `settings.identity.registrations` |
| `AGV-*` numbering prefixes | `NumberingSeries.prefix` |
| `SITE_ORIGIN` in `answer-core.ts` | tenant primary host |
| T&C clause sets inside `invoice-pdf.tsx` | `TermsClauseSet` / `TermsClause` |
| Cochin/Vizhinjam port defaults | `settings.docs.originPorts[]` |

### 8.1 `TenantSettings` shape

One row per tenant, typed JSON groups validated by Zod at `Z/src/lib/tenant-settings/schema.ts`. JSON rather than columns because these are read together, written rarely, and evolve weekly. Identity fields that *documents require* stay as columns on `Tenant` (they already are) so the doc engine can build a fix-list from them.

Groups: `identity` (tradeName, registrations record, lut, addresses, defaultBankAccountId) · `brand` (colours, logo assets, font, letterheadMode, signature, signatory) · `docs` (ccRecipients, bccArchive, internalDomains, defaultIncoterm, originPorts, footerNote, declarationsByDocType, termsSetByDocType) · `commercial` (paymentTermsDefault, moqPolicy, lead times, currencyDefault, fxBasisDefault) · `vocabulary` (industryPackId, productNoun, unitLabels, entityLabels) · `ai` (agentEnabled, autoSendEnabled, allowIntents, denyTopics, minConfidence, delaySeconds, caps, maxMessageAgeHours, allowedLanguages, signOffName, voiceNotes, promptHash) · `email` (fromName, replyTo, sendingDomainId) · `locales` (ui[], uiDefault, documentDefault).

### 8.2 Layering and the single read path

Effective settings = **industry-pack defaults** ← **country-pack defaults** ← **plan entitlement clamp** ← **tenant overrides**.

Country-pack defaults come from a new `settingsDefaults` field on `CountryPack` in `Z/src/packs/types.ts` — India supplies `fxBasisDefault: 'cbic'`, registration keys `gstin`/`iec`/`adCode`, LUT declarations; UAE supplies `trn`, zero-rating evidence fields, no fiscal-year numbering. The plan clamp is where "custom fonts are Growth+" and "AI desk is Growth+" live.

One read path: `getTenantSettings(tenantId)` at `Z/src/lib/tenant-settings/get.ts`, memoised per-request with React `cache()` and cross-request with `unstable_cache` tagged `tenant-settings:{tenantId}`.

**Consumers — this list is the acceptance criterion for "nothing is hardcoded":** `Z/src/lib/doc-engine/context.ts`, `pdf.tsx`, `rules.ts`, `numbering.ts`; `Z/src/lib/email/*`; the agent context builder; the autosend gate; every `t()` call (vocabulary overrides the message catalog).

### 8.3 Packs: two dimensions

**CountryPack** (`Z/src/packs/`, exists — registry, types, static import map, `assertPackCapability`). Ships `in` and `ae` at launch.

- `in`: fiscal-year numbering (1 Apr–31 Mar), GST/LUT/IGST endorsements verbatim, place of supply per IGST s.11(a), Rule 46(b) serial character rules, Table 6A builder with `problems[]`, FEMA clocks (9-month realization, 12-month advance shipment), eBRC requirement for realization closure, lakh/crore number-to-words, HSN. Ported from `A/src/lib/gst-export.ts` and `A/src/lib/invoice-series.ts`.
- `ae`: TRN, zero-rated export evidence, mainland vs free-zone invoicing, customs declaration reference fields, chamber-issued Certificate of Origin, calendar-year numbering, no fiscal-year concept. **Every rule in this pack requires advisor sign-off before it ships** (CCO brief). Unverified rules ship behind a feature flag labelled provisional.

**IndustryPack** (`Z/src/packs/industry/<id>/`, new, same discipline):

```ts
export type IndustryPack = {
  id: string; label: string;
  specAxes: SpecAxisDef[];
  defaultCategories: CategoryDef[];
  uoms: string[];
  pricingMethodDefault: PricingMethod;
  qcDefaults: { aqlLevel: string; inspectionLevel: string; stages: string[] };
  docVocabulary: Record<string, string>;
  promptFragments: { productDescription: string; specQuestions: string; escalationExtras: string[] };
  factTemplates: { category: string; template: string }[];
};
```

Ship `generic` and `textiles` at launch; `food`/`agri` and `engineering` next. **This is where all of Anabyn's textile content goes** — the prompt *shape* stays in versioned markdown, the *content* is injected from the pack. A tenant picks a pack at onboarding, which seeds their spec axes, categories, QC defaults and first facts; everything is editable afterwards and the pack is never consulted again at runtime.

---

## 9. Functional scope: full export ops

Mapped from Anabyn's admin surface. Each row: what it does → where it comes from → which migration it needs.

| Module | Scope | Ported from | Migration |
|---|---|---|---|
| **Unified inbox** | Gmail + WhatsApp + web forms on one lead timeline; three-pane keyboard-first client; assign/snooze/close/merge; sandboxed HTML rendering | `A/src/lib/integrations/inbound.ts`, `outbound.ts`, `thread-events.ts`; `Z` InboxChannel/InboxMessage | D |
| **Leads / CRM** | Unified `leads` with one `source` identifier; table/kanban/card; stage + quality with heuristic suggestion; identity index; SLA; loss reasons; foreign-buyer priority | `A` lead.ts, lead-sla.ts, buyer-origin.ts, customer-grade.ts | — (Buyer/Lead exist) |
| **Today queue** | 7 item kinds × 3 severities fused from threads, leads, tasks, invoices, samples, vendors, orders, FX staleness, cert expiry | `A/src/lib/today-queue.ts` | — |
| **Chase ladder** | Two pure date-driven ladders (quote, invoice); final step always requires a human; exhaustion closes as `lost_no_response` | `A/src/lib/chase-ladder.ts` | D (OutboxItem) |
| **Products & specs** | Generic spec-axis engine; categories; variants; queryable spec values; bulk import | new, pack-seeded | A |
| **Pricing** | per_piece / per_kg / per_meter / per_sqm; size×axis matrices; margin rules by priority; Incoterm ladder EXW→DDP with per-step breakdown; FX snapshots with basis | `A` pricing-calc.ts, pricing-catalog.ts, incoterm-calc.ts, margin-rules.ts | A |
| **Rate lists & catalogue** | Published price list with basis + validity; tokenised share; gated PDF; digital catalogue with price-free projection | `A` rate-sheet.ts, catalogue/* | A |
| **Quotes** | Quotation as a document type with `priceMode` indicative/firm, revisions, loss reasons, buyer accept/negotiate link | `A/src/app/actions/invoice.ts` quotation verbs; `Z` Quote | C |
| **Invoicing** | 8 doc types (quotation, proforma, receipt voucher, commercial, tax, packing list, credit/debit note); **serial allocated only inside the issue transaction**; declared floor re-applied every issue; cancelled keeps its number at nil; post-issue immutability with `amend_issued` audit; convert paths; partial shipment; advance carry-forward | `A` invoice-series.ts, invoice.ts, invoice-calc.ts | C |
| **Export documents** | Doc-set generation; base + country + product requirement rules; buyer-visible allowlist; tokenised doc-set share for CHA/buyer; bank document pack | `A` export-doc-rules.ts, buyer-visible-docs.ts | B/C |
| **Orders** | Line items carrying full pricing provenance; status pipeline; embedded shipment; milestones; payment schedule; LC details; buyer tracking link | `A` order model | B |
| **Production** | Production runs and stages with vendor and PO linkage; real progress from stages, not from the status index | `A` production.ts (**fixing the gap where the board never reads stages**) | B |
| **QC / AQL** | Inspection at pre-production/inline/final/loading; lot→sample→accept tables; structured defects by severity; photos; gate before shipping | `A` aql + qc_approvals (restructured — Anabyn's is one flat blob) | B |
| **Inventory** | Locations; per-variant-per-location stock; movement ledger with balance-after; par stock and reorder radar | `A` inventory.ts | B |
| **Samples** | Requests with SLA; physical sample stock; movements; loans with due-back | `A` sample.ts | B |
| **Procurement** | Vendor capability grid (processes × capabilities × machines × units); evidence-only scorecards; rate history chain with supersession; RFQ broadcast and compare; cost requests and revalidation; PO + job work with issue/receipt challans | `A` vendor-*.ts | B |
| **Finance** | Vendor ledger (derived, never stored) with aging; AP/AR aging; payments with allocation; expenses with duplicate guard; recurring invoices; bank statement import and reconciliation; cash-flow forecast; order P&L with margin drift | `A` vendor-ledger.ts, expense.ts, gst-export.ts | C |
| **Compliance** | Realization tracking (money **and** eBRC), FEMA clocks, filing exports with `problems[]`, certificate expiry, sanctions screening | `A` gst-export.ts; `Z` screening.ts | C |
| **Claims** | Quality/shortage/damage/delay/payment claims linked to order, invoice, buyer or vendor, resolvable into a credit note | `A` claims (thin — extend) | B |
| **Tasks & notifications** | Polymorphic tasks linked to any entity; in-app notification centre with per-kind preferences; ops digest | `A` tasks.ts, ops-digest.ts | D |
| **Marketing** | Segments with reach-before-send, campaigns, double opt-in, preference centre, RFC 8058 unsubscribe | `A` campaign.ts, newsletter.ts | D |
| **AI sales desk** | Triage → pre-filter → answer pack → agent proposal → price guard → human approval; autosend gate with four kill switches; playbook that learns from escalations | `A/src/lib/agent/*`, `A/src/lib/ai/*` | D |
| **Settings** | Identity, branding, domains, members, billing, integrations, numbering, terms, AI config, data export, support access, delete org | new | D |
| **Platform console** | Tenant list/detail, suspend, slug reclaim, feature flags, impersonation, support grants, per-tenant AI cost, analytics | `Z/src/app/admin` (extend) | D |

---

## 10. Integrations

### 10.1 Mailboxes: per-tenant *and* per-user

`IntegrationCredential`'s `@@unique([tenantId, kind, account])` is already the multi-mailbox primitive — nothing about the vault changes. Anabyn's singleton `gmail_connections/shared` is exactly what we are replacing.

Account convention:
- `account = 'shared:<localpart>'` → shared mailbox (`sales@`, `docs@`), `InboxChannel.visibility = 'tenant'`
- `account = 'user:<userId>'` → a rep's own mailbox, `ownerUserId` set, `visibility = 'owner_only'`

Inbox queries become `where: { tenantId, OR: [{ channel: { visibility: 'tenant' } }, { channel: { ownerUserId: me } }] }`.

Providers: **Gmail** (exists — extend to multi-account; use *our* OAuth client so CASA review happens once), **IMAP/SMTP** (implement `Z/src/lib/inbox/imap.ts` against the existing `InboxProvider` interface; cursor is `"<UIDVALIDITY>:<lastUID>"` and a UIDVALIDITY change forces a reseed — that is the classic correctness bug), **Microsoft 365** (Graph delta + change notifications with per-connection `clientState`; subscriptions expire in ~3 days so a renewal sweep is mandatory).

**Port Anabyn's Gmail sync operational knowledge verbatim** — it is the single most incident-scarred file in either repo: never use `category:primary` (matches nothing on a Workspace mailbox with tabs off), never use `in:inbox` (routing rules label-and-archive before sync sees it), hold the cursor when the page budget is exhausted (Gmail lists newest-first, advancing orphans the old end of the window), suppress triage and alerts during backfill, and record `lastSyncError` on the connection so "connected" never looks healthy while every run fails.

### 10.2 WhatsApp: one webhook, N tenants

Two routes:

**Shared** `/api/inbox/whatsapp` — us as Meta Tech Provider with embedded signup. Verify `X-Hub-Signature-256` against `META_APP_SECRET` (**the current route does not verify signatures at all — anyone who learns a `phone_number_id` can inject messages into a tenant's inbox; this is a launch blocker**). Fan out by `phone_number_id` through the `WhatsAppNumber` table, whose unique index makes the mapping a DB-enforced invariant rather than a scan. Unknown id → log and return 200, never 500 (Meta throttles the shared endpoint for every tenant).

**BYO** `/api/inbox/whatsapp/[connectionId]` — tenant registers their own Meta app. Opaque per-`Integration` id in the path; per-connection verify token and app secret in the vault under `kind: 'whatsapp_app'`.

Both converge on the existing persist-then-`enqueue({ kind: 'inbox.ingest' })` pipeline, already idempotent via `@@unique([channelId, externalMessageId])`.

Outbound keeps the hard `ConsentRecord` gate that `Z/src/lib/whatsapp/send.ts` already enforces. Add a template-sync job so the UI lists the tenant's approved templates instead of a free-text name.

**The general webhook rule, to be written into `Z/specs/SECURITY_BASELINE.md`:** never route a webhook by Host; route by an opaque path segment or a provider-native id resolved through a uniquely-indexed mapping table; always verify the signature; always persist-then-enqueue and return 200.

### 10.3 Sending domains, consent, unsubscribe

Resend is already a dependency. `Z/src/lib/email/sending-domain.ts`: owner adds `mail.acme.com` → `POST /domains` → store DKIM/SPF/DMARC records → verification job polls until verified.

**From-address resolution, one function `resolveSender(tenantId)`:** verified default `SendingDomain` → per-tenant subaddress on our shared domain (`acme@mail.zimplifyed.ai`, DMARC-aligned, no tenant DNS needed) → platform default. A tenant sends on day one and upgrades later.

Every outbound marketing and transactional email sets `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. `/u/[token]` is host-agnostic and writes `ConsentRecord { status: 'revoked' }` — the same table the WhatsApp gate reads, so one revocation covers both channels. Resend bounce/complaint webhooks auto-revoke on hard bounce and spam complaint and pause a campaign past a complaint-rate threshold.

---

## 11. The AI layer

### 11.1 `runAiLoop` — what the router is missing

`Z/src/ai/router.ts` `runAi()` is single-shot with no tool loop and no prompt caching. Anabyn's agent is a 6-tool loop with a deterministic cached system prefix. Add alongside `runAi()` in the same file so it inherits the tier map, cost table, retry, timeout and fallback:

```ts
export type AiLoopTask = AiTask & {
  tools: AiToolDef[];        // name, description, schema, permission, run(tenantId, input)
  terminals: string[];       // submit_proposal | ask_for_help | no_action
  maxTurns: number;          // default 8
  cachePrefix: string;       // byte-stable -> cache_control: { type: 'ephemeral' }
};
export async function runAiLoop(task: AiLoopTask): Promise<AiLoopResult>;
```

It calls `enforceAiBudget` per turn and writes one `AiInteraction` per run with the transcript in metadata, so the nightly eval harness and `AiFeedback` keep working.

Tools come from the shape already in `Z/src/ai/retrieval.ts`, which has exactly the right property: each carries a `permission` and a tenant-scoped `run`. **AI isolation is therefore structural and already designed.** Do not weaken it with a generic "query anything" tool.

Loop rules ported verbatim from `A/src/lib/agent/loop.ts`: a run ends only through a finishing tool; a model that stops without one is nudged once; invalid finishing input goes back to the model and is never persisted; refusal, turn-cap and abort end without a decision; all tool results from one turn return in a single user message; the system prompt and tool list are byte-identical every turn.

### 11.2 Prompt-cache determinism per tenant

The cached prefix is `[industry fragment] + [tenant voice] + [tenant facts] + [hard rules] + [tool contract]` — stable per tenant, changed only when settings change. Render it at settings-save time into `settings.ai.systemPromptSnapshot` with a `promptHash`, never at request time. Today's date, the thread, the answer pack and triage hints go in the first user message. This is exactly Anabyn's split, and the reason is written in its header: any per-run byte silently disables caching.

Tenants never edit prompt files. They edit facts, playbook entries, voice notes and deny topics.

### 11.3 Answer pack: retrieval, not generation

The answer pack is a **deterministic function**, not a model call — that is what makes the price guard enforceable. Given a triaged enquiry it assembles `{ lines: [{ text, sourceKind, sourceId }], coverage, missing[], recommendedDocument }` from matching products and variants, price-list items, margin-rule output, Incoterm ladder steps, MOQ and lead times from settings, and certifications from `ComplianceItem`. Pure over injected rows, therefore table-testable. Lives at `Z/src/modules/agent/domain/answer-pack.ts`.

Keep Anabyn's one behavioural distinction: when a human requests it, the rate list is numbered and its share link minted; when the agent requests it, the draft stays unnumbered. **Numbering and sharing are acts of sending.**

### 11.4 Guardrails

- **Price guard** (`A/src/lib/agent/price-guard.ts`): every number attached to money, a percentage, a quantity or a duration must appear in the grounded context. Grounding sources change from module constants to `TenantFact` rows + answer-pack lines + transcript + tool outputs. Findings flag, they do not block — the person decides, but knowingly.
- **Autosend gate** (`A/src/lib/ai/autosend-gate.ts`): ports verbatim in logic; signature changes from module constants to `gate(settings.ai, ctx)`. Fail-closed and deny-wins preserved literally. **Both the tenant switch and a platform `FeatureFlag` must be on to send.** Ships off on both.
- **Pre-filter** (`A/src/lib/ai/pre-filter.ts`): free header/sender heuristics before any model call. This is the cost control and must be in the path before `runAi`.
- **Outbox**: supersede-on-human-engagement and re-gate-immediately-before-send, ported to `OutboxItem` + a `outbox.flush` job on the durable queue, replacing Firestore + cron.
- **Four independent kill switches** as Anabyn ships them: platform flag, tenant setting, per-thread `aiEnabled`, and an assigned human opting a thread out.

### 11.5 Per-tenant knowledge

`KnowledgeChunk` has `packId` and no `tenantId`. Add `tenantId String?` + `scope`. Retrieval:

```sql
WHERE (scope = 'pack'   AND "packId"  = $1 AND "supersededAt" IS NULL)
   OR (scope = 'tenant' AND "tenantId" = $2 AND "supersededAt" IS NULL)
ORDER BY embedding <=> $3 LIMIT $4
```

This is `$queryRaw`, so the Prisma extension does not protect it. It needs an explicit tenant parameter on every call, a `// tenant-safe:` annotation with reasoning, and a dedicated live test that a tenant chunk never surfaces for another tenant. Corpus sources: uploaded spec sheets, approved past replies, catalogues, buyer term sheets. Ingestion reuses `Z/scripts/ingest-corpus.ts` with a `--tenant` flag and a plan-based chunk quota metered through `MeterEvent`.

### 11.6 The playbook loop

Agent hits an unanswerable question → `ask_for_help` with up to four one-click options → staff answers → staff can promote the answer into `AgentPlaybookEntry` → future runs retrieve it. This is per-tenant institutional memory and the highest-leverage AI feature to ship, because it improves without any model work.

---

## 12. i18n

**Two locale systems, deliberately separate** — the insight to carry over from `A/src/i18n/routing.ts`.

| | App UI locale | Document / email locale |
|---|---|---|
| Chosen by | the logged-in user | the buyer, or per-document override |
| Applies to | `/dashboard`, `/admin`, `/welcome` | PDFs, emails, tokenised buyer pages, catalogues |
| Prefix | `localePrefix: 'never'` (cookie/user pref) | not URL-driven |
| SEO | no (noindex) | only `(marketing)` |

Marketing is a third case: `localePrefix: 'as-needed'` with real URL prefixes, `localeDetection: false` and `alternateLinks: false`, hreflang emitted per page — port Anabyn's config wholesale for that route group.

**Locales.** App UI: `en`, then `hi`, then `ar`. Documents and emails (higher priority than UI): `en`, `ar`, `es`, `fr`, `de`, `it`, `ru`, `zh`. A proforma in the buyer's language is a selling feature; a Hindi settings screen is not.

Catalogs at `Z/messages/<locale>.json`, namespaced per module. `Z/next.config.ts` (currently empty) wraps with `createNextIntlPlugin()`.

**Document locale is part of the snapshot.** `DocContextSchema` in `Z/src/lib/doc-engine/context.ts` gains `locale` and `brand`, for the same reason `issuedAt` is already on the context: builders must be pure for the golden harness to pin them. A regenerated document in another locale is a new version, not a mutation.

**Three PDF traps to plan for** while `pdf.tsx` is being rewritten anyway: `@react-pdf/renderer` has no bidi/shaping, so Arabic needs Noto Naskh plus a genuine RTL layout variant, not a CSS flip; CJK needs a subsetted font or the PDF is 8 MB; tenant custom fonts must be validated (TTF/OTF, licence checkbox, size cap) and are a Growth+ entitlement. Also inherit Anabyn's hard-won detail: register `.woff`, not `.woff2` — react-pdf's fontkit cannot decompress Brotli.

`num-to-words` is locale *and* numbering-system specific: English in core, the lakh/crore variant in `Z/src/packs/in/`, called as `pack.numberToWords(locale, amount, currency)`.

Tenant vocabulary sits **above** the catalog: `t('entity.buyer')` checks `settings.vocabulary.entityLabels.buyer` first. One wrapper at `Z/src/lib/i18n/t.ts`.

---

## 13. Verification

Keep the `tsx`-script convention in `Z/package.json`. One exception, in §13.4.

### 13.1 Table tests — the non-negotiable list

Every ported module arrives with its table. Each as `Z/src/tests/<area>/<name>.test.ts`:

| Area | Properties pinned |
|---|---|
| Numbering | gapless under 50 concurrent issues; serial minted only inside the issue transaction; declared floor re-applied every issue; seeding idempotent; **cancelled keeps its number at nil value**; FY rollover at 31 Mar / 1 Apr; calendar mode; over-length flags but does not block |
| Pricing | all four methods on the same spec; matrix lookup including missing cells; margin-on-price vs markup round-trip; floor soft-block and override |
| Incoterm | all 11 terms; per-step breakdown; EXW ⊂ FOB ⊂ CFR ⊂ CIF ⊂ DDP monotonic |
| Margin rules | priority order; `default` always last; a conditionless non-default rule never matches |
| Vendor ledger | derived balance; opening balance; aging at exact bucket boundaries; CSV round-trip |
| Scorecard | **returns `null` with zero evidence**; price index vs median by `specKey` |
| Today queue | 7 kinds × 3 severities; foreign outranks domestic; stable ordering on ties |
| Chase ladder | both ladders day-by-day; final step always requires a human |
| Autosend gate | full truth table — deny wins, fail closed on unknown intent, every cap, age cutoff, language filter, both kill switches |
| Price guard | every number grounded; currency- and comma-formatted variants; no false positive on dates or quantities |
| India pack | LUT vs IGST endorsement verbatim; LUT validity; place of supply; 9-month and 12-month clocks at exact boundaries; **realization requires both zero unrealized and an eBRC number**; Table 6A row + `problems[]` |
| UAE pack | zero-rating evidence completeness; calendar numbering; the provisional-flag path |
| Export doc rules | base + country + product for every supported destination; country-name normalisation aliases |
| Host classification | ~30 hosts → expected resolution, including `evil.com`, `demo.zimplifyed.ai.evil.com`, empty, port-only, punycode, uppercase |
| AQL | lot → sample → accept/reject at every level and boundary |
| Ingest | provider-id idempotency; atomic lead creation under concurrent first messages; thread-key scheme; inbound reopens a closed thread |

### 13.2 Golden fixtures for documents

Extend `Z/src/tests/doc-engine/golden.ts`. Two tiers:

1. **DocModel golden** — pure builder output as canonical JSON. Deterministic because `issuedAt` is on the context. Cases: 8 doc types × {LUT, IGST} × {goods, services} × {single-currency, FX} × {en, ar} × {in, ae}.
2. **Rendered golden** — render to PDF, extract text and layout boxes, assert statutory blocks present, in order, unclipped. Byte-diffing a PDF is useless; assert on extracted content plus a structural hash.

Add a **brand matrix** case: the same doc set rendered with two different brand asset sets must differ *only* in colour, logo and font — never in field content. That test is what proves branding is presentation and not data.

### 13.3 Isolation tests

The widened static scan (merge-blocking); the generated-model-list sync test; the live two-tenant test over `DIRECT_URL`; an extension-throws-without-scope test; the raw-SQL lint; a webhook cross-tenant test (the same `phone_number_id` cannot reach two tenants, an unknown one is a no-op); a public-token test (a token from A never reads B, and works on every host).

### 13.4 One browser test

Add Playwright in Wave 2 for exactly one spec — the revenue walkthrough — and keep it at one spec for a long time. Everything else stays `tsx`.

### 13.5 The release walkthrough (`Z/docs/RELEASE_WALKTHROUGH.md`)

Run before every wave ships. Any step that cannot be completed is wave-blocking.

> signup → verify email → create org (slug reserved) → pick plan (trial) → pick country pack and industry pack → fill company identity → watch the doc fix-list go empty → invite a colleague as `sales` → connect a shared mailbox → connect a personal mailbox and confirm the colleague cannot see it → connect WhatsApp → paste an enquiry → see it triaged onto a lead timeline → create a product with spec axes → create variants → build a price matrix → publish a rate list → share it → create a quote → convert to proforma (serial allocated at issue) → render the PDF, branded, in Arabic → record an advance → generate the receipt voucher → convert to commercial invoice with the advance deducted → raise a PO to a vendor → issue job-work material → record receipt → run a final QC inspection → pass the doc gate → generate the export doc set → share it with a CHA by token → issue the commercial invoice (serials gapless, in issue order) → record a buyer payment → allocate it → enter the shipping bill → mark realized with an eBRC → export the filing pack and read its `problems[]` → view order P&L with margin drift → view the vendor ledger and age it → export all tenant data including document binaries → request support access as platform staff → owner approves read-write for 1h → verify the banner and audit rows on both sides → revoke → delete org → restore within the window.

---

## 14. Anabyn as tenant #1: migration and cutover

Anabyn's public marketing site (~250 landing pages, 41 blog posts, live rankings) **stays on Firebase and does not move.** Only `/admin` operations migrate. This is the lowest-risk split and it protects the SEO asset.

**Phase 1 — shadow.** Export Firestore collections to Postgres nightly with a one-way ETL. Anabyn keeps operating in Firebase; the SaaS holds a read-only mirror. This validates the schema mapping against real data volume and real edge cases before anything depends on it.

**Phase 2 — dual-write.** New leads, threads and messages write to both. Compare daily. This is where identity-index and thread-key mapping bugs surface.

**Phase 3 — cutover, module by module, in this order:** Products & pricing (least coupled) → CRM & inbox → quotes → orders & production → invoicing (**last, because serial continuity is the highest-stakes migration in the whole project**).

**Serial continuity is the hard constraint.** Anabyn's live series (`AGV-PFI`, `AGV-CI`, …) must continue without a gap and without a reuse. Migration procedure: freeze issuance → read the highest issued serial per prefix per FY from Firestore → seed `NumberingCounter.next` past it → set `NumberingSeries.declaredFloor` to the same value → issue one test document in each series → verify → unfreeze. Anabyn's `seedSeriesCounterIfMissing` + `declaredSeriesFloor` already encode this procedure; port it and run it as the migration, not as a special case.

**The dogfooding rule:** every hardcoded `anabyn` that survives into the SaaS is a bug found by Anabyn's own operators. That is the point of this choice. Keep a running list; it is the acceptance criterion for §8.

---

## 15. Phasing

Each wave is independently shippable and ends in a state where Anabyn could run its business. Public signup opens after Wave 7.

### Wave 0 — Foundations (no visible feature; everything depends on it)
- Prisma extension + `withTenant`/`withPlatformScope` ALS; generated `TENANT_SCOPED_MODELS`
- Widen the isolation scan to the whole server surface; platform-scope allowlist; raw-SQL invariant
- Fix and enable the live two-tenant test via `DIRECT_URL`
- **Delete the `DEV_TENANT_SLUG` production fallback**; `classifyHost` as a pure total function + its table
- Migration D (partial): `TenantSettings`, `TenantBrandAsset`, `TermsClauseSet`/`TermsClause`, `TenantFact`, `TenantDomain` (subdomain rows only)
- Migration C (partial): `NumberingSeries`/`NumberingCounter`
- `MembershipRole.owner` expand + new permissions + `ops_admin` equivalent
- `CountryPack.settingsDefaults`; `IndustryPack` registry with `generic` + `textiles`

### Wave 1 — Signup to first real document
- Rewrite `Z/src/lib/doc-engine/pdf.tsx` as real react-pdf, using `A/src/components/invoice/invoice-pdf.tsx` (2,338 lines) as the *specification* for statutory blocks
- Issue transaction: serial only at issue, floor re-applied, cancelled keeps number at nil, post-issue immutability with `amend_issued` audit
- Settings UI: identity, branding, numbering, terms, doc CC, internal domains
- India pack: endorsements, place of supply, LUT validity
- Onboarding wizard: country pack, industry pack, spec axes, first facts, first products
- Golden fixtures tier 1

### Wave 2 — Doc sets, UAE pack, first payment
- Export doc rules into packs; doc-set generation; tokenised doc-set share; golden tier 2
- **UAE/GCC pack with advisor sign-off**; provisional-flag path; the pack interface proven by two real packs
- Tokenised pages made host-agnostic and branded; `resolvePublicToken` + exemption manifest
- `Payment` + `PaymentAllocation` (record a buyer payment against an invoice)
- Playwright: the one walkthrough spec

### Wave 3 — Catalogue and pricing depth
- Migration A in full: taxonomy, spec axes, variants, pricing methods, matrices, margin rules, Incoterm ladders, FX snapshots, catalogue share
- Ports: `pricing-calc.ts`, `incoterm-calc.ts`, `margin-rules.ts`, `fx.ts`
- Rate lists with basis and validity; digital catalogue at `/catalogue/[token]`
- Quotes with revisions, loss reasons and the buyer accept link

### Wave 4 — Inbox at scale, integrations, i18n
- `Integration` model; shared + per-user Gmail; IMAP/SMTP; Microsoft 365 with subscription renewal
- WhatsApp: **signature verification (launch blocker)**, `WhatsAppNumber` fan-out, BYO route, embedded signup, template sync
- `SendingDomain` + Resend domains API + one-click unsubscribe + bounce handling
- next-intl for marketing and app; document locales; RTL and CJK fonts
- Unified lead timeline, ingest port, leads module, tasks, notification centre

### Wave 5 — AI sales desk
- `runAiLoop` with deterministic cached prefix and the permission-gated tool loop
- Answer pack, price guard, autosend gate (dual kill switch), pre-filter, `OutboxItem` + flush job
- `KnowledgeChunk.tenantId` + per-tenant ingestion + the raw-SQL isolation test
- `AgentPlaybookEntry` + help-request → playbook promotion
- Today queue, chase ladder
- Per-tenant AI cost view in the platform console (CFO gate)

### Wave 6 — Supply side
Migration B in full: vendor capability grid, evidence-only scorecards, rate history chain, RFQ broadcast and compare, cost requests, POs and job work with challans, production runs and stages (**and fixing the board so it reads stages, not the status index**), QC/AQL with structured defects and the pre-shipment gate, inventory with movement ledger, par stock, samples, claims.

### Wave 7 — Money depth
Full payment allocation, `VendorBill`, derived vendor ledger with aging, AP/AR aging, recurring invoices, bank statement import and reconciliation, cash-flow forecast, order P&L with margin drift, filing exports with `problems[]`, realization tracking with eBRC, `TaxFilingExport` audit trail.

**Gate: run the full walkthrough. Then open public signup.**

### Wave 8 — Platform maturity
Custom domains (`TenantDomain` activated: TXT/CNAME verification, Vercel Domains API, canonical redirect, dangling-CNAME sweep), public API + outbound webhooks, SSO/SAML, 2FA, marketing and campaigns, Postgres RLS as the fourth isolation layer, third country pack.

---

## 16. Port manifest

**Near-verbatim** — pure, only type imports change:
`A/src/lib/margin-rules.ts` · `incoterm-calc.ts` · `chase-ladder.ts` · `vendor-ledger.ts` · `vendor-scorecard.ts` · `ai/autosend-gate.ts` · `ai/pre-filter.ts` · `agent/price-guard.ts` · `agent/eligibility.ts` · `fx.ts` · `rate-sheet-basis.ts` · `par-stock.ts` · `export-doc-rules.ts` (into `Z/src/packs/`) · `gmail-mime.ts` · the formatting half of `invoice-series.ts` · `app-shell/types.ts` nav-visibility helpers

**Adapt** — logic survives, storage and config swap:
`invoice-series.ts` allocation half (Firestore counter → `NumberingCounter` upsert inside the Prisma transaction — the pattern already in `Z/src/lib/doc-engine/numbering.ts`) · `gst-export.ts` → `Z/src/packs/in/gst.ts` · `today-queue.ts` (fusion and ordering intact, input adapters swap) · `ai/inbox-config.ts` (module constants → `TenantSettings.ai` defaults) · `ai/outbox.ts` (Firestore + cron → `OutboxItem` + Job queue) · `ai/triage-runner.ts` · `agent/{context,playbook,loop,tool-defs,tools,jobs,proposals}.ts` → `Z/src/modules/agent/` merged with the permission-gated tool shape in `Z/src/ai/retrieval.ts` · `integrations/inbound.ts` (identity index and atomic creation → a Prisma transaction; thread-key scheme and denormalised `isExport`/`countryCode` kept) · `pricing-calc.ts` + `pricing-catalog.ts` (calculations port; the catalogue *data* becomes DB rows plus industry-pack seeds) · `app/actions/gmail.ts` sync (all its operational rules, none of its singleton assumptions)

**Rewrite:**
`A/src/components/invoice/invoice-pdf.tsx` — read it for the statutory blocks, write fresh against `TenantSettings.brand` and `DocContext` · `A/src/lib/agent/genkit-call-model.ts` — superseded by `runAiLoop` · everything under `A/src/firebase/`, `A/src/lib/auth/`, `A/src/lib/session-cookie.ts` · `A/src/app/[locale]/admin/production/page.tsx` — rewrite against `ProductionStage`, do not port the fake progress

**Leave behind:**
`A/src/lib/sales-recipients.ts`, `company-story.ts`, `people.ts`, `commercial-terms.ts` (become `TenantSettings` and `TenantFact` rows) · every Anabyn SEO/content module (`towel-exporter-data.ts`, `bed-linen-*`, `city-linen-data.tsx`, `blog.ts`, `faq-data.ts`, `glossary.ts`, `internal-links.ts`, `geo-exporter-metadata.ts`, `usp-*`) · Firestore rules and emulator tests · Genkit · `generate-export-doc-button.tsx` (the ad-hoc parallel HTML doc path with placeholder GSTIN — the doc engine replaces it)

**Name collision to resolve at port time:** both repos have `src/lib/pricing-buildup.ts`. Zimplifyed's (margin-on-price with `MARGIN_FLOOR_PCT`) is the keeper; Anabyn's is subsumed by the ported `margin-rules.ts`. Do not blind-copy.

---

## 17. Launch blockers

Ordered. None of these is negotiable before public signup.

1. `DEV_TENANT_SLUG = 'demo'` production fallback deleted (`Z/src/lib/tenant-resolver.ts`)
2. WhatsApp webhook `X-Hub-Signature-256` verification (`Z/src/app/api/inbox/whatsapp/route.ts`)
3. Live two-tenant isolation test green in CI
4. Isolation scan widened past `src/actions`
5. Data export includes document binaries
6. UAE pack advisor sign-off, or the pack ships flagged provisional
7. `Z/README.md` is still create-next-app boilerplate
8. Sentry actually installed with alerting (currently env-guarded and inert)
9. The full walkthrough in §13.5 passes end to end
10. Every item on the Anabyn-hardcoding list closed

---

## 18. Open questions

These need an owner's answer during the waves they affect, not now:

- **UAE pack contents** — the whole of §8.3 `ae`. Owner: CCO, before Wave 2.
- **Anabyn's six unconfirmed India items** from `A/docs/EXPORT-INVOICING-SOP.md`: RBI purpose code for advances, eBRC 2.0 flow, whether the AD bank wants the receipt voucher, LUT ARN for FY26-27, correspondent bank details, and whether the 9-month limit (hardcoded) has exceptions. These block full realization automation in Wave 7.
- **Duty rate provenance** — the free tools carry duty data that is public but unverified. Either get a tariff-source sign-off or label it clearly.
- **Whether the vendor portal seat is free forever.** It is a strong growth loop and a real support cost.
- **India e-invoicing threshold awareness** — we do not compute a tenant's turnover today, so we cannot tell them when IRN generation becomes mandatory. Decide whether that is in scope or an explicit non-goal.

---

## 19. Execution

This document is the brief, not the code. The first commit in Zimplifyed is this file at `docs/EXPORT_OS_MASTER_PLAN.md`, followed by Wave 0 in the order listed in §15, each item verified by the test named beside it in §13.
