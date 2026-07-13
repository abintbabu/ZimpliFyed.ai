# Development Plan to 100% — Zimplifyed.ai

_Date: 2026-07-12 · Owner: CTO · Companion: CTO_TECH_PLAN.md (architecture), CPO_PRODUCT_PLAN.md (scope), MASTER_LAUNCH_PLAN.md (phases)._

Two finish lines, planned as one continuous build:

- **100% launchable (Milestone L)** — everything needed to charge money at 2026 Q4 paid launch. ~30% remaining. **12 working weeks** in current mode (founder + AI agents), Sprints 1–6.
- **100% of the full vision (Milestone V)** — all five phases, every department AI-run. **~30 months**, Stages 2–7, effort halving as hires land.

Effort unit: **ew = engineer-week** in current AI-augmented single-founder mode. With the first 2 hires (Stage 3+), divide wall-clock by ~2.

Rules carried from existing plans (non-negotiable):
1. Nothing async ships before the queue/worker foundation (Sprint 1).
2. Golden evals before any public accuracy claim.
3. Cross-tenant CI tests become merge-blocking before design partners touch real data.
4. Government filings and payments stay L0 forever; autonomy promotions follow the ≥60% unedited-acceptance rule.
5. Spec updates ship in the same PR as the code (AI_PLATFORM, SECURITY_BASELINE, BILLING, new INBOX_SPEC).

---

## STAGE 1 — "100% launchable" (Sprints 1–6, 12 weeks, now → 2026 Q4)

### Sprint 1 (wks 1–2) — Foundation hardening — 2 ew
The gate everything else passes through.
- [ ] pg-boss queue on Postgres + one worker process (Fly/Railway); idempotency-key convention.
- [ ] Expand-contract migration tooling + checklist (pays down the 2026-07-11 DECISIONS debt).
- [ ] Cross-tenant read/write CI test per action file — merge-blocking.
- [ ] Credential-vault primitive: envelope encryption (KMS) for integration secrets table.
- [ ] STORAGE_* env → R2 in prod (closes risk R2); Sentry wired (app + worker).
- [ ] Razorpay adapter **started** (runs through Sprint 3): order/checkout flow, webhook handler, GSTIN capture, GST-compliant invoice PDF.
**Exit:** worker processes a job end-to-end in prod; CI blocks a deliberately-leaky action; Razorpay test-mode checkout completes.

### Sprint 2 (wks 3–4) — Doc engine steps 2–3 — 2 ew
- [ ] PDF template system: proforma, commercial invoice, packing list, COO on DocContext (step 2).
- [ ] Deterministic rule engine: cross-doc consistency checks as data-driven rules (step 3); discrepancies render as the fix-list.
- [ ] Versioned doc-sets + tokenized share links (buyer/CHA, no login).
**Exit:** a real order generates a 4-doc set with zero manual re-entry; 20 golden fixtures pass.

### Sprint 3 (wks 5–6) — Doc engine steps 4–5 + billing complete — 2 ew
- [ ] AI consistency pass (reason tier, cached) layered over the rule engine (step 4).
- [ ] Golden eval harness for doc fields: accuracy dashboard, regression-blocking in CI (step 5).
- [ ] Razorpay **done**: UPI/netbanking live, plan lifecycle parity with Stripe, dunning states.
- [ ] Doc-set metering → MeterEvent → overage invoicing (₹99/doc-set rail).
**Exit:** doc-set field accuracy measured (target ≥95% on golden set); a tenant can pay ₹1,499 by UPI and get a GST invoice.

### Sprint 4 (wks 7–8) — Document/vision pipeline + expense snap — 2 ew
The founder's headline example, first pipeline on the new framework.
- [ ] Pipeline framework: `src/ai/pipelines/{docType}.ts` — upload → virus/type check → queue → vision extract (Zod schema) → classify → confidence gate → auto-record or review queue. Every extraction logs AiInteraction.
- [ ] Expense pipeline: image/PDF/UPI screenshot → GST head + ITC-eligibility + order attribution → Expense ledger post → Order P&L rollup.
- [ ] Review-queue UI (the generic surface later reused by inbox and bank-statement pipelines).
- [ ] Extraction-accuracy eval fixtures from day one.
**Exit:** snap 20 varied receipts → ≥80% auto-post at high confidence, rest queued; Order P&L reflects them.

### Sprint 5 (wks 9–10) — Sales spine: RFQ→quote chain + onboarding aha — 2 ew
- [ ] "Paste a buyer enquiry" intake box (empty dashboard + leads page) → AI extraction (product, qty, specs, Incoterm, target price) → Lead+Buyer dedupe/create.
- [ ] One-tap chain: extracted RFQ → cost-sheet draft (price-list/vendor-rate prefill, Incoterm cost lines, margin vs floor) → quote PDF → tokenized buyer link.
- [ ] Onboarding acceptance criteria (CPO §5): fresh tenant → pasted enquiry → draft quote with visible margin in ≤3 user actions; activation event fires.
- [ ] Follow-up cadence engine v1 off DomainEvents (quote.sent + N days silence → drafted nudge in tasks, L1).
**Exit:** time-to-first-quote measurable; the demo flow runs start-to-finish on a clean tenant.

### Sprint 6 (wks 11–12) — Launch hardening — 2 ew
- [ ] LC-checker tool (metered, public page — the PQL magnet per GTM).
- [ ] Copilot depth pass: verify §G33 canonical questions answer correctly.
- [ ] Design-partner blockers: agreement flow, "decision support, not a CA/CHA" disclaimers on GST pack + doc engine.
- [ ] Load/perf pass (p95 < 500ms interactive, doc-gen < 5s), error-state/empty-state/mobile sweep of the 6 core flows.
- [ ] Pricing page with CHA anchor; billing e2e test matrix (trial→paid→overage→dunning→cancel, both rails).
**Exit = MILESTONE L:** a stranger can sign up, activate, generate real docs, pay in INR. **Ship the paid launch.**

Stage-1 contingency: 2 buffer weeks are already inside the sprint estimates; if doc accuracy misses 95%, launch holds while Sprint 4/5 features go to a beta flag — accuracy is the launch gate, features are not.

---

## STAGE 2 — Unified inbox + sales agent (2027 Q1–Q2, ~10 wks solo / 6 with hire #1)

The flagship demo of the expanded vision. New spec: `specs/INBOX_SPEC.md`.
1. **Models** (1 ew): Channel / Conversation / Message (+ aiExtract), encrypted creds via Sprint-1 vault.
2. **Email ingestion** (3 ew): per-tenant forwarding address first (zero-review-risk path, ships in week 1); Gmail OAuth + watch/PubSub behind it — **start Google CASA review week 1, it takes 8–12 wks**; IMAP IDLE worker for Zoho/Outlook.
3. **WhatsApp Business** (2 ew): Meta Cloud API, template approval workflow, 24-hr session logic, conversation-fee → MeterEvent; BSP fallback path spiked.
4. **Extraction → CRM** (2 ew): per-message intent/entity extract → auto-link or create Lead/Buyer/Activity (L2 with review queue); prompt-injection eval fixtures (hostile buyer email) in CI **before** GA.
5. **Sales agent v1** (2 ew): inbound requirement → quote-draft AgentRun (L0/L1) reusing Sprint-5 chain; follow-up planner GA.
**Exit:** ≥60% of new signups connect a channel; requirement→draft-quote works from a real WhatsApp message. Hiring: product eng #1 + AI/platform eng #2 land here.

## STAGE 3 — Agent orchestration GA + Action Queue (2027 Q2–Q3, ~7 wks at 3 eng)
1. `AgentRun` durable step-log model + trigger engine (DomainEvents, inbox, cron) — deliberately boring, no framework.
2. Autonomy-ladder mechanics: per-flow promotion/demotion driven by AiFeedback acceptance metrics; guardrail sign-off flow (CFO/compliance owner); every gate decision logged.
3. **Action Queue** (the v2 keystone): one cross-department approve/edit/reject inbox + daily brief integration. Median decision time <30s target.
4. Agent scorecard in admin console.
**Exit:** two flows promoted to L2 on real acceptance data; a founder's day runs from the queue.

## STAGE 4 — Finance department complete (2027 Q3–Q4, ~8 wks at 3–4 eng)
1. GST ledger + month-end GSTR-1/3B **data pack** assembly; CA-scoped Membership role + export views (new persona, CPO §2).
2. GSP partner integration (MasterGST/Cygnet class): e-invoice IRN, GSTR draft push — filing always human-approved. Dual-vendor contract.
3. Bank-statement pipeline (PDF/CSV → vision pipeline → BankRealization auto-match); Account Aggregator (Setu/Finvu) spike → integration.
4. Tally XML / Zoho CSV export (the "keep Tally" promise).
5. Receivables agent (L3 pilot #2): overdue detection → chaser drafts → cadence.
**Exit:** expense-classification accuracy ≥97%; a CA runs month-end for 3 clients inside the product. CA-channel console unblocks GTM.

## STAGE 5 — Scale-out + Stage B infra (2027 Q4–2028 Q1, ~6 wks at 4–5 eng, interleaved)
Triggered by ~1k users, not by date.
1. Queue → SQS/QStash; worker fleet autoscaled; Redis for rate-limit/budget counters.
2. Supabase dedicated compute + read replicas; month-partitioning on Message/AiInteraction/DomainEvent; analytics offload (ClickHouse/Tinybird).
3. **Mumbai region migration** (DPDP residency — cheap now, expensive later); DPDP consent records + deletion-cascade verification test.
4. SOC 2 program starts; /security page + subprocessor list (blocks GSP/enterprise deals otherwise).
5. Prompt-cache hit-rate + AI-COGS weekly dashboards; batch tier for nightly work.
**Exit:** p95 holds at 3× load; AI COGS <20% of plan revenue verified from MeterEvent, not assumptions.

## STAGE 6 — Full-stack firm (2028, ~2 quarters at 5–8 eng)
1. Production depth: stage plans by product type, one-tap mobile check-ins (PWA), slippage detection → drafted buyer/vendor comms, QC/AQL photo-evidenced, packing/cartonization, sampling.
2. Freight desk: forwarder RFQ reusing the vendor-RFQ engine; carrier tracking via aggregator API (project44/Vizion class).
3. Vendor portal at scale: tokenized quote submission → lightweight vendor accounts (the biggest user multiplier — target vendor users ≥1.5× tenant users).
4. Compliance + Sales agents complete the L3 set; Copilot v2 tool-use across all modules.
5. Inside-sales enablement surfaces: PQL scoring off usage events.
**Exit:** manufacturer persona week-4 retention ≥40%; a manufacturer runs order→production→QC→ship→docs→money without leaving the product.

## STAGE 7 — Money + borders (2029, ongoing at ~10+ eng)
1. Fintech attach via licensed partners: collections/FX referral rails, marine/credit insurance one-click, invoice-financing referrals — product exposes data hooks; partners carry licenses. Risk/compliance officer hired **before** volume.
2. CountryPack #2 (Bangladesh or Vietnam — corridor data decides 2028 Q4): all India-specific logic already fenced in `src/packs/in/`, so this is a pack, not a fork.
3. Buyer-side importer workspace (supplier-enablement loops).
4. L4 autonomous filings only where a partner/GSP makes it legally clean.
**Exit = MILESTONE V:** every department in CPO §3 runs at its target autonomy level; fintech ≥15% of revenue; second country live.

---

## Dependency spine (what blocks what)

```
Queue/workers ──► every pipeline, every agent
Credential vault ──► Gmail, WhatsApp, GSP, AA
Vision pipeline ──► expense snap ──► GST pack ──► GSP ──► fintech underwriting data
Golden evals ──► accuracy claims ──► per-outcome pricing ──► L-promotions ──► L3 agents
Inbox models ──► sales agent ──► Action Queue ──► "queue + brief" UX
CASA review (8–12 wk lead) ──► Gmail GA          Meta review ──► WhatsApp GA
Mumbai migration ──► DPDP posture ──► enterprise/GSP deals
```

## Standing tracks (every stage)
- **Evals:** every new AI flow ships with fixtures; weekly accuracy report; regression blocks merge.
- **Security:** quarterly cross-tenant pen-test of new surfaces; prompt-injection fixtures grow with each ingestion channel.
- **Cost:** weekly cost/tenant-action from MeterEvent; alert at 10× anomaly and >20% of plan revenue.
- **Docs:** spec deltas in the same PR; DATABASE_PLAN refreshed each migration wave; ROADMAP done-log updated per sprint.

## Verification per milestone
- **L:** scripted end-to-end: signup → paste enquiry → quote → order → doc-set → UPI payment → overage invoice. Run against prod weekly.
- **V:** the "3-person firm" test — a design partner runs one full order lifecycle with only approval taps; count human minutes vs AI actions (the north-star metric, instrumented).

## Top schedule risks
1. **External reviews** (CASA, Meta, GSP onboarding) — all started weeks before their feature work; manual-path fallbacks mean no launch hard-depends on them.
2. **Doc accuracy plateau** below 95% — mitigated by design-partner data volume; launch gate honors it.
3. **Solo-founder bandwidth through Stage 2** — hire #1/#2 budgeted at paid launch (CFO plan); scope cuts come from features, never from the foundation/eval/security tracks.
