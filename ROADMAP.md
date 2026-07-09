# Zimplifyed.ai — Live Roadmap & Status Tracker

**The one doc updated weekly.** Everything else describes intent; this records reality. Absorbs MIGRATION_PLAN §7b as the single progress ledger. Conventions: `[x]` shipped & verified · `[~]` in progress · `[ ]` not started · each line names its source doc/section.

_Last updated: 2026-07-09_

---

## 1. Status snapshot by plan

### MIGRATION_PLAN (the port) — ~70% complete
- [x] Prisma schema core: Tenant/User/Membership/Invite + auth models
- [x] Money pipeline: Vendor, VendorRate(+Tier), Quote(+LineItem), Invoice(+LineItem), Order, OrderBuyerTrack + actions + pages
- [x] `pricing-buildup.ts`, deal-rail, `/track/[token]`, funnel-leak alerts
- [x] Leads + Tasks + Users/invites + Audit + Settings pages
- [~] Quote/invoice line-item **edit** UI (create-only today)
- [ ] Vendor portal · samples · inventory · claims · finance/expenses modules (port later, on demand — not blocking)

### PRODUCT_PLAN phases
- [x] **Phase 0** foundation: shell, audit, permissions matrix, tenant guard (file storage = local flag, see risk R2)
- [x] **Phase 1** trader MVP: quotes, vendor RFQs (`vendor-rfqs.ts`), cost sheets (`cost-sheets.ts`), orders, invoices, tracking link — *gap: Copilot v1 exists as page, verify depth*
- [x] **IMPLEMENTATION_PLAN Wave 1** CRM/catalog backbone: Buyer+Contact+Activity+Product+PriceList models, `/dashboard/buyers` (list/detail/contacts/activity/quotes/orders), `/dashboard/products` (list/detail/price-list items), lead→buyer conversion, quote builder buyer+product picker with price-list prefill and margin-floor soft-block (`MARGIN_FLOOR_PCT`, admin override), quote versioning (`reviseQuote`, revision chain UI) + buyer-facing share/accept link (`/quote/[token]`), buyer backfill script (`scripts/backfill-buyers.ts`) — *gap: AI-assisted dedupe for near-duplicate buyer names (script does exact-match only)*
- [~] **Phase 2** ship & comply: export-documents ✅, hs-codes ✅, compliance ✅, shipment-milestones ✅, screening ✅, letters-of-credit ✅ — *gap: cross-doc consistency AI (needs DOC_ENGINE_SPEC), doc templates beyond first set*
- [~] **Phase 3** money: incentive-claims ✅, order-pnl ✅, daily founder brief ✅ (`founder-brief.ts`, `/dashboard/brief`) — *gap: e-BRC/FIRC reconciliation, cash-flow forecast*
- [ ] **Phase 4** manufacturer depth: production stages, QC/AQL, packing, sampling, freight desk
- [ ] **Phase 5** platform: portal imports, integrations, marketplace

### SELF_SERVE_PLAN phases
- [x] **A** self-signup: post-auth resolver (`post-auth.ts`), org wizard (`/welcome/create`), demo seeding (`seed-demo.ts`), onboarding checklist + demo banner, invite links + bulk invite, domain auto-join, DB-backed rate limiting (`rate-limit-db.ts`), `/join/[token]`, platformRole in session — *gap: magic-link email provider not yet wired (Google + credentials only)*
- [~] **B** roles UX: tenant switcher ✅ (dashboard) — *gap: permission-verb expansion, generated nav, role dashboards*
- [~] **C** billing + lifecycle → `BILLING_SPEC.md`: plans/entitlements (`billing/plans.ts`), `requireFeature`+`PlanGateError`, usage rollup off MeterEvent, seat gate on invites, `/dashboard/settings/billing` usage UI — *gap: Razorpay/Stripe adapters, webhooks, lifecycle state machine, export job*
- [ ] **D** platform admin console, impersonation, flags
- [ ] **E** growth loops

### VISION_1B §10 day-one imperatives (architectural debt clock ticking)
- [~] CountryPack abstraction → `COUNTRY_PACK_SPEC.md`: `packs/types.ts` contract, `registry.ts`, `in/` manifest (GSTIN/IEC/PAN validators, compliance seeds, incentive schemes, capabilities), `Tenant.packId` (default `in`), demo seed routes compliance through the pack — *gap: move HS/doc/incentive logic into `in/`, lint guard for `IN`-literals outside packs*
- [x] Metering (AI actions, doc-sets, shipments) → `AI_PLATFORM_SPEC.md` (schema + `ai/metering.ts` + usage rollup in `billing/entitlements.ts`)
- [x] AI feedback capture (accept/edit/reject) schema (`AiFeedback`) — *gap: UI to submit ratings*
- [ ] Audit log → event stream
- [ ] Golden-file accuracy tests for doc generation → `DOC_ENGINE_SPEC.md`

### GTM_PLAN quarterly commitments
- [~] 2026Q3: HS-finder (`/tools/hs-finder`) + landed-cost (`/tools/landed-cost`) tools ✅ — *gap: positioning/site rewrite, first 200 pages, community, design partners*
- [ ] 2026Q4: paid plans live (**depends: SELF_SERVE C**), LC-checker tool, 2 meetups, 50 paying orgs

### TEAMS_AND_ORG calendar-bound items (externally fixed lead times)
- [ ] 2027H1: SOC 2 program start · PA-CB partner conversations start
- [ ] 2027H2: IRDAI corporate-agent application (if insurance 2028)
- [ ] Before design partners onboard: design-partner agreement + real ToS/Privacy (signup links to `#` today)

## 2. Cross-doc dependency graph (blockers first)

```
SELF_SERVE A (signup)  ──→ GTM Q3 design-partner onboarding at scale
SELF_SERVE C (billing) ──→ GTM Q4 paid launch ──→ $1M ARR math
AI metering (VISION §10) ──→ per-outcome pricing (engine 2) ──→ BILLING usage rail
DOC_ENGINE golden evals ──→ L2 doc-set launch (GTM 2027Q2) ──→ insurance guarantee (2029)
CountryPack abstraction ──→ every new doc template ──→ country launches 2028
Event stream ──→ L3 agents · webhooks · health score (CS §1.2)
SELF_SERVE B (role nav) ──→ public launch quality bar (GTM stage 1)
Legal ToS/Privacy ──→ ANY paid or design-partner signup
```

## 3. Now / Next / Later

**NOW (this sprint):** SELF_SERVE Phase A build per ONBOARDING_SPEC · real ToS/Privacy pages · metering table + feedback capture (small schema additions, outsized future value) · line-item edit UI (finishes the money pipeline).
**NEXT (1–2 months):** Phase B roles UX · BILLING_SPEC build · first SEO tools (HS finder, landed cost) · design-partner recruitment · founder brief (Phase 3 gap, feeds role dashboards).
**LATER (quarter+):** DOC_ENGINE v1 with CountryPack · admin console · Phase 4 modules on customer pull.

## 4. Risk register (live)

| # | Risk | Status | Owner action |
|---|---|---|---|
| R1 | ToS/Privacy links | 🟢 closed | real `/terms` + `/privacy` pages shipped |
| R2 | File storage production-viability | 🟡 open | `storage.ts` already has S3/R2 adapter with local-disk dev fallback; just set `STORAGE_*` env before design partners upload |
| R3 | `super_admin` naming vs owner semantics (SELF_SERVE §1.3) | 🟡 open | wizard labels role "Owner" in UI; relabel remaining surfaces in Phase B |
| R4 | Doc templates accumulating without CountryPack | 🟢 mitigated | CountryPack abstraction landed (`src/packs/`); templates register via pack |
| R5 | No rate limiting on auth/invite | 🟢 closed | in-memory login limiter + DB-backed limiter (`rate-limit-db.ts`) on signin/invite/orgcreate/slugcheck |

## 5. Update protocol
Weekly (with the §4 metrics sheet review): flip checkboxes, re-date the header, add/close risks, move Now/Next/Later. Quarterly: reconcile against GTM calendar and TEAMS triggers; archive completed sections to a `## Done log` at the bottom rather than deleting.

## Done log
- 2026-07-06: money-pipeline port (MIGRATION §7b detail preserved there)
