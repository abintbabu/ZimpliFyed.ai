# Zimplifyed.ai — Complete Product Roadmap

**The single roadmap document.** Rewritten from scratch 2026-08-31, superseding the old migration tracker (see git history before this date for the port ledger). Companion docs: `VISION_1B.md` (long-horizon thesis), `docs/DECISIONS.md` (decision log — this rewrite proposes revisiting several locked calls; see §8 and the dated appendix entry there).

---

## 1. North Star & Operating Thesis

**Thesis:** Zimplifyed is the operating system for an exporting company — one platform covering demand → lead → quote → sourcing → order → production → logistics → documentation → compliance → money — designed so a **one-person company can run every department**, because AI does the department work and the human approves it in a single queue.

**Design rule (unchanged):** SMB simplicity, enterprise depth. Every workflow has a manual path; AI layers on top, never blocks.

**North-star metric (proposed change):** **Zero-touch order rate** — % of orders shipped end-to-end where every document, follow-up, and reconciliation was AI-produced and approved without edit. This replaces "AI-completed department-hours/org/week" (harder to instrument honestly, easy to game with low-value actions). *Ratified-as-amended 2026-08-31 (supersedes DECISIONS.md 2026-07-12 [CEO] north-star entry).* **Public-claim embargo (CMO):** the number is not used in marketing/PR until ≥10% sustained for 8 weeks; denominator = shipped orders of AI-active tenants, any human edit disqualifies the order (definition to live in `specs/METRICS_DEFINITIONS.md`). Supporting metrics: weekly active orgs, approve-without-edit rate per flow (feeds autonomy promotion), doc-sets generated, receivables days-outstanding delta.

**Personas:**
1. **Solo founder-exporter (ICP-1, primary)** — runs everything from phone + laptop; WhatsApp-native.
2. **Merchant trader, 2–10 people** — sales + docs + finance roles split; needs permissions and audit.
3. **Manufacturer-exporter, 10–50** — adds production/QC/inventory depth.
4. **Partners** — CA/accountant (scoped finance role), CHA/freight forwarder (doc-share + collaboration).
5. **Overseas buyer** — portal-side: tracking links, quote acceptance, later a real portal.

---

## 2. Complete Capability Map — every scenario in an exporter's life

Legend: **[Built]** shipped & working · **[Partial]** exists but incomplete · **[Planned]** not started. Every [Partial]/[Planned] item appears in exactly one phase in §4.

### 2.1 Demand & Marketing
- [Built] Marketing site, pricing, self-serve signup (magic link), demo mode, 3 free lead-gen tools (HS finder, landed-cost calculator, LC checker).
- [Planned → B] **Marketplace lead sync** — pull enquiries from IndiaMART / TradeIndia / Alibaba into the inbox spine.
- [Planned → B] **Social capture** — FB/IG/LinkedIn DMs and lead forms into the inbox spine (capture only; no publishing suite at first).
- [Planned → C] **AI outbound** — buyer-discovery prospecting from trade data (importers of your HS codes by country), AI-drafted intro emails via action queue.
- [Planned → D] **Social/content publishing** — AI-generated product posts, catalogs, WhatsApp catalog sync.
- [Planned → D] **Micro-storefront** — hosted product catalog page per tenant (SEO surface + enquiry form feeding the CRM).

### 2.2 Leads & CRM
- [Built] Lead capture, stages, quality scoring, lead→buyer conversion, buyer 360 (contacts, activity timeline, quotes, orders), AI enquiry extraction, AI buyer follow-up drafts (action-queue producer).
- [Partial → A] **Omnichannel capture** — Gmail sync live, WhatsApp push webhook live; IMAP/generic-email and WhatsApp pull providers are stubs.
- [Planned → B] **Follow-up cadences** — configurable sequences (day-3 nudge, day-7 re-quote, quarterly reactivation) as autopilot with per-tenant autonomy level.
- [Planned → C] **AI dedupe/enrichment** — near-duplicate buyer merge, firmographic enrichment.

### 2.3 Sourcing & Vendors
- [Built] Vendor master, rate cards with tiers, vendor RFQ send/collect/compare.
- [Planned → B] **Vendor portal** — vendors answer RFQs, upload docs, confirm POs via tokenized links (no vendor login needed at first).
- [Planned → C] **Vendor scorecards** — on-time %, quality rejections, price trend.
- [Planned → C] **Sampling workflow** — sample request → courier tracking → buyer feedback → convert to order.

### 2.4 Quoting & Costing
- [Built] Quote builder with price-list prefill, cost sheets, landed-cost + pricing-buildup engines, margin-floor soft-block with admin override, quote versioning/revision chain, public share/accept link, RFQ→quote AI extraction.
- [Planned → B] **Quote follow-up autopilot** (sweep exists; promote to auto-send at L2).
- [Planned → C] **Negotiation copilot** — counter-offer analysis against cost sheet + margin floor, drafted replies via action queue.

### 2.5 Order Execution & Production
- [Built] Order spine, shipment milestones, doc-readiness panel, buyer tracking link, order P&L.
- [Planned → C] **Production tracking** — stages, work orders, delay alerts (action-queue producer).
- [Planned → C] **QC/AQL** — inspection checklists, photo evidence, third-party inspection booking.
- [Planned → C] **Inventory-lite** — stock in/out against orders, packing-material tracking. (Full WMS is out of scope permanently.)
- [Planned → C] **Packing module** — carton/pallet plan generating the packing list automatically.

### 2.6 Logistics & Freight
- [Built] Shipment milestones, buyer tracking link.
- [Planned → B] **Freight desk v1** — RFQ to forwarders (reuses vendor-RFQ machinery), rate compare, booking record.
- [Planned → C] **Container/AWB tracking** — carrier-API or aggregator polling → milestone auto-update → buyer notification.
- [Planned → D] **CHA collaboration workspace** — shared checklist + doc exchange on shipping-bill lifecycle (extends doc-share links).

### 2.7 Documentation & Compliance
- [Built] Doc engine: PI/CI/PL/COO builders, deterministic cross-doc rule engine (incl. IEC/GSTIN/HS checks), per-tenant numbering, versioned persist, HTML print renderer, tokenized buyer/CHA share links, golden-fixture CI harness. Sanctions screening, HS-code assist (AI classification), compliance-item tracking, LC advisor + doc-vs-LC consistency AI, incentive claims (RoDTEP-style), e-BRC/FIRC reconciliation.
- [Partial → B] **PDF rendering** — HTML-only today; swap in @react-pdf/renderer (slipped from A, 2026-08-31 cut).
- [Partial → A/B] **Doc review screen** — Phase A ships inline aiFindings in the approve flow; full review screen in Phase B (2026-08-31 cut).
- [Partial → A] **Compliance-expiry producer** — sweep exists, not wired to action queue.
- [Planned → B] **Doc-set autopilot (L2)** — per-shipment: order event triggers generation, rules + AI pass, queued for one-tap approve.
- [Planned → C] **Certificate management** — COO/phyto/BIS/fumigation etc. as tracked artifacts with expiry + renewal nudges.
- [Planned → D] **Country pack #2–3** — Vietnam/Bangladesh/UAE doc + compliance packs.

### 2.8 Money
- [Built] Invoices + templates, expense OCR pipeline, cash-flow forecast (6-week), GST filing-prep pack, bank realizations, letters of credit, cost sheets/order P&L, Stripe + Razorpay billing for Zimplifyed itself, receivables-chase sweep.
- [Partial → A] **Dunning producer** — receivables-chase sweep exists; wire to action queue, then L2 auto-send.
- [Planned → C] **Banking** — statement upload + AI reconciliation first, Account Aggregator later (posture unchanged).
- [Planned → C] **Multi-currency & FX exposure** — outstanding-by-currency view, hedging nudges.
- [Planned → C] **GST filing via GSP partner** — prepare→CA-review→file with GSP; pulled forward from "2028+ only"; ratified-as-amended 2026-08-31 — legal review + GSP partner shortlist run in Phase B as a zero-code workstream, Phase C carries build/cert/ship only; filing stays L0 (human-approved) forever.
- [Planned → D] **Trade finance / factoring / export credit insurance referrals** — take-rate revenue; partner marketplace, never balance-sheet risk.
- Out of scope permanently: general ledger, payroll ("keep Tally, we sync to it" positioning stands).

### 2.9 Communications Hub
- [Built] Unified inbox spine (InboxChannel/InboxMessage), Gmail sync sweep, WhatsApp inbound webhook, AI inbox classification, Resend transactional email.
- [Partial → A] **Reply from inbox** — today ingestion-only. Ratified-as-amended 2026-08-31 (supersedes DECISIONS.md 2026-07-12 [CPO] "ingestion only"): **the send path exists only as an action-queue consumer.** Send is allowed solely as (a) reply-in-thread on an existing InboxMessage or (b) WhatsApp template/session send triggered by a domain event; every send is an action-queue item or an approved L2 flow. No free-compose surface, no folders/labels/snooze/assignment/read-state sync/shared-inbox rules/signatures.
- [Partial → A] **WhatsApp Cloud API send** — outbound templates in Phase A (session messages slip to Phase B per CTO cut); quotes, tracking, dunning go out via WhatsApp.
- [Planned → B] **Voice notes → structured actions** — founder speaks in Hindi/English, AI extracts lead/expense/task; WhatsApp-native.
- [Planned → C] **Vernacular support** — Hinglish + major Indian languages in AI drafts and UI strings.

### 2.10 Intelligence & Analytics
- [Built] Daily founder brief, action queue (SELL/MONEY/SHIP/COMPLY), copilot Q&A with pgvector retrieval, dashboard stat cards + funnel-leak alerts, order P&L.
- [Planned → C] **Analytics v1** — sales funnel, margin trends, buyer concentration, DSO, incentive pipeline.
- [Planned → D] **Benchmarks** — anonymized cross-tenant benchmarks (freight rates, margins by HS chapter, payment terms) — the data moat.

### 2.11 Platform
- [Built] Multi-tenancy + tenant guard, permissions matrix + role-driven nav, audit log, domain events, feature flags, DB rate limiting, S3/R2 storage, credential vault, durable job queue + worker, billing lifecycle + entitlements + metering, platform-admin console + impersonation, India country pack (partial), data export, AI router/budget/feedback/eval harness.
- [Partial → A] **Observability** — Sentry env-guarded but not installed; no alerting.
- [Partial → A] **Live tenant-isolation tests** — static analysis only today.
- [Partial → C] **Country-pack extraction** — India literals still outside `packs/in/`; add lint guard.
- [Planned → B] **Mobile PWA** — installable, offline-tolerant read + queue-writes for inbox/action-queue/brief.
- [Planned → D] **Public API + webhooks** — for CA firms and partner integrations; Tally sync export.

---

## 3. AI-Everywhere Ladder

The Action Queue is the universal approval surface. **Rule: every new AI capability ships as an action-queue producer first**; direct-effect AI is earned via promotion, never default.

| Level | Meaning | Examples | Status |
|---|---|---|---|
| **L1 Assist** | AI drafts, human approves each item | enquiry extraction, doc consistency, follow-up drafts, expense OCR | **Built** |
| **L2 Autopilot** | AI executes whole recurring workflows; human approves batches/exceptions | doc-set per shipment, follow-up cadences, dunning auto-send, milestone updates | Phase B |
| **L3 Named agents** | Department agents with goals, memory, and tool whitelists; priced per agent-month | Sales agent (lead→quote), Docs agent (order→approved doc-set), Finance agent (invoice→cash) | Phase C |
| **L4 Autonomous** | Negotiation, filings, bookings within hard policy bounds | rate negotiation, incentive claims filing | Phase E |

**Promotion rule (ratified-as-amended 2026-08-31, supersedes the 2026-07-12 [CPO] global rule):** per-tenant, per-flow — ≥60% approve-without-edit with **min 30 instances** over the rolling last 50 **AND Wilson 95% lower bound ≥50%** promotes that flow one level for that tenant. Auto-demotion on 3 rejections in a rolling 7 days OR rejection rate >20% over the last 10 (volume-aware); demotions surface in the daily brief with a re-promotion path. CFO/compliance sign-off is per flow **type**, not per promotion. Government filings and payments remain L0/L1 permanently. Single-shot approval gate (one draft → at most one external effect) stays.

---

## 4. Phased Roadmap

**Sequencing rationale (rethought):** the old plan sequenced by department (Docs→Sales→Finance→…). The new sequencing is **by loop**: first make the entire lead-to-cash loop closable inside the product for a solo exporter (breadth, shallow), then deepen each segment with autopilots and agents. Rationale: a one-person company buys a closed loop, not a deep silo; a deep Docs module still forces them to live in Gmail/WhatsApp/Tally for everything else. ⚠️ *Revises DECISIONS.md 2026-07-12 [CEO] department sequencing.*

### Phase A — 2026 Q4 · "Close the loop" (launch)
**Goal:** a solo exporter runs enquiry → quote → order → docs → payment → reconciliation entirely inside Zimplifyed. Ship the paid launch.

Scope cut to ~7 items per CTO review (ratified 2026-08-31):
1. Wire remaining action-queue producers (compliance-expiry, dunning nudge, shipment delay alert) + approve-without-edit eval instrumented from day one (promotion currency).
2. Razorpay billing lifecycle end-to-end.
3. Sentry installed + alerting; live-DB tenant-isolation test.
4. WhatsApp Cloud API send — **templates only** (Meta business verification starts week 1).
5. Consent-record model (required before outbound send GA per residency decision).
6. Gmail reply-in-thread, flag-gated (CASA review starts week 1).
7. Inline aiFindings surfaced in the approve flow (substitute for the full doc review screen).

Slipped to Phase B: full doc review screen, @react-pdf/renderer swap, CSV + AI import, WhatsApp session messages.

Metrics gate to Phase B: 25 orgs completing a full loop; ≥50% approve-without-edit on doc-sets; first paying customers on Razorpay.

### Phase B — 2027 H1 · "One-person company"
**Goal:** the loop runs itself; the founder's day is the brief + the action queue + WhatsApp.

- **L2 autopilots:** doc-set per shipment, quote follow-up cadences, dunning auto-send — all governed by the per-tenant promotion rule.
- **Voice notes → actions** (WhatsApp voice → lead/expense/task).
- **Mobile PWA** (inbox, action queue, brief, approvals).
- **Freight desk v1** (forwarder RFQ + rate compare, on vendor-RFQ machinery).
- **Vendor portal** (tokenized RFQ answers, PO confirm, doc upload).
- **Marketplace lead sync** (IndiaMART first) + **social DM capture** into inbox spine.
- IMAP/generic email provider (de-stub), inbox pull providers completed.
- Slipped from Phase A: full doc review screen, @react-pdf/renderer swap, CSV + AI import, WhatsApp session messages.
- **GST legal review + GSP partner shortlist (zero-code workstream)** — starts here so Phase C carries build/cert/ship only (6–9 months serial external lead time).

Metrics gate: zero-touch order rate ≥10%; 1k orgs; ≥30% of tenants with ≥1 flow at L2.

### Phase C — 2027 H2 → 2028 H1 · "Departments as agents"
**Goal:** named agents do department work; manufacturer depth arrives.

- **L3 named agents:** Sales agent, Docs agent, Finance agent — durable AgentRun step-logs over runAi (per CTO architecture decision), priced per agent-month.
- **Production & QC module:** stages, work orders, QC/AQL checklists, delay-alert producer; **packing module** auto-generating packing lists; **inventory-lite**; **sampling workflow**; **vendor scorecards**.
- **Money depth:** bank-statement upload + AI reconciliation → Account Aggregator; multi-currency/FX exposure; **GST filing via GSP** (post-legal-review, CA-in-the-loop, L0 forever).
- **Container/AWB tracking** with milestone auto-update; **certificate management**.
- **Analytics v1**; AI dedupe/enrichment; negotiation copilot; AI outbound prospecting; vernacular AI drafts.
- Platform: country-pack extraction completed + lint guard (prerequisite for Phase D packs); Mumbai region migration at ~1k users (per residency decision); queue swap-point review (pg-boss→SQS) per CTO trigger.

Metrics gate: zero-touch order rate ≥25%; agent-month attach ≥15% of paid orgs; break-even trajectory per CFO model (~2,400 paying orgs 2028H2).

### Phase D — 2028 · "Network & fintech"
**Goal:** monetize the network around each shipment; expand beyond India.

- **Buyer portal** (quotes, orders, docs, payments status for the overseas buyer).
- **CHA collaboration workspace**; **public API + webhooks + Tally sync**.
- **Fintech referrals:** trade finance/factoring, FX, export credit insurance — take-rate revenue, partner-led, no balance-sheet risk.
- **Country packs #2–3** (Vietnam, Bangladesh, UAE) on the extracted pack contract.
- **Benchmarks/data products** (anonymized, opt-in); **social/content publishing**; **micro-storefronts**.

### Phase E — 2029+ · "Autonomous trade"
- L4 autonomy (negotiation, filings, bookings within policy bounds), marketplace matching (exporter↔buyer↔forwarder), buyer-side product line. Direction per `VISION_1B.md`; detail deliberately deferred.

---

## 5. Monetization (rethought)

Value metric stays **AI outcomes**, but the entry economics change for the one-person ICP:

- **Free** — CRM + 5 doc-sets lifetime + 20 AI actions/mo (CAC budget per CFO decision, unchanged).
- **Solo — ₹999/mo** (CFO-ratified 2026-08-31) — exact bundle: **1 user, 100 AI actions/mo, 5 doc-sets/mo; no L2 autopilots, no API, no CA role**; overage anchors unchanged (₹99/doc-set, ₹199/100 AI actions); ~80% GM. Differentiation vs Starter is structural (seats + roles), not a discount.
- **Starter ₹1,499 / Growth ₹4,999 / Enterprise ₹15,000+** — unchanged structure; Growth gains L2 autopilots, Enterprise gains L3 agents.
- **Agent-month pricing (Phase C, CFO-ratified 2026-08-31):** ₹2,999/agent/mo (500 included actions) or ₹4,999/agent/mo (1,500 included actions), overage ₹199/100; **requires Growth+ base plan**. Uncapped pricing rejected (25–50% GM).
- **Fintech take rates (Phase D):** referral bps on financed invoices/FX/insurance.
- Break-even model stands (~2,400 paying orgs 2028H2); re-run mix model when Solo hits 100 paying orgs — if Solo >40% of paid mix, break-even shifts to ~2,800–3,000. Existing-customer prices untouched; no pricing-page change until CFO-signed and user-confirmed.

---

## 6. Risks & Guardrails (standing)

- **Regulatory one-way doors:** GST filing only via GSP + CA-in-loop, L0 forever; sanctions screening advisory-only wording; DPDP → Mumbai at ~1k users; consent records ship with inbox GA.
- **AI blast radius:** single-shot approval gate stays; auto-demotion on rejections; L2+ flows have per-tenant kill switches; budgets enforced per org.
- **Integration fragility:** every integration keeps a manual-upload path (unchanged, keep this decision); Meta/WhatsApp policy risk mitigated by channel-adapter architecture (WhatsApp is a channel, never a structural dependency).
- **Channel conflict:** never compete with Tally or the CA (sync/export, CA persona role) or IndiaMART (we run the deal after the inquiry) — positioning locked, unchanged.
- **One-person execution risk (ours):** prefer sweeps + producers over new surfaces; every phase ships hardening (tests, observability) alongside features; marketing claims checked against shipped code (CMO decision, unchanged).

---

## 7. Immediate Next 6 Weeks (ordered backlog)

1. Week 1: start Meta business verification (WhatsApp) and Google CASA review (Gmail scopes) — longest external lead times.
2. Wire compliance-expiry, dunning, delay-alert producers to the action queue + approve-without-edit eval.
3. WhatsApp Cloud API outbound (templates only: quote-sent, tracking-update, payment-reminder).
4. Consent-record model (blocks outbound send GA).
5. Email reply-in-thread from inbox (Gmail first, flag-gated) with AI draft via action queue.
6. Razorpay billing lifecycle end-to-end test.
7. Install Sentry + alerting; live-DB tenant-isolation test.
8. Inline aiFindings in the approve flow.
9. Fix pre-existing pricing-test TypeScript errors; replace boilerplate README.

(Slipped to Phase B per 2026-08-31 cut: PDF swap, full doc review screen, CSV + AI import, IMAP/pull de-stub, WhatsApp session messages.)

---

## 8. Decisions revisited — ratified as amended 2026-08-31

All six revisits were reviewed by the CXO round and **ratified as amended by the CEO on 2026-08-31** (see the dated block in `docs/DECISIONS.md`): ① department sequencing → loop-first (accepted; consent model before send GA, kill switch with L2 auto-send); ② inbox ingestion-only → reply capability bounded to "send path only as an action-queue consumer"; ③ GST → legal review + GSP shortlist start Phase B zero-code, Phase C build-only; ④ north star → zero-touch order rate with public-claim embargo (≥10% sustained 8 weeks) and strict denominator; ⑤ promotion rule → per-tenant per-flow, min 30/last 50 + Wilson 95% LB ≥50%, volume-aware demotion; ⑥ pricing → Solo ₹999 with exact bundle, agent-month with action caps + Growth+ requirement. All two-way except the GST gate and the public-claim rules.

---

*Previous migration/status tracker: see this file's git history before 2026-08-31 (last tracker update 2026-07-10, migration ~70%).*
