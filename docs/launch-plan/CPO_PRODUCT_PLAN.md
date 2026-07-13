# Zimplifyed.ai — CPO Product Plan (Founder's Expanded Vision)

_Authored by CPO, 2026-07-12. Extends PRODUCT_PLAN.md (the capability map A–G remains the
source of truth for module-level detail); this doc restates the product as the founder's
expanded vision demands: **one AI-first system in which every department of an export firm
is runnable by a founder or 3-person team with minimal human intervention.**_

Companion docs: ROADMAP.md (reality ledger), SELF_SERVE_PLAN.md (signup/tenancy),
specs/ONBOARDING_SPEC.md, specs/DOC_ENGINE_SPEC.md, specs/AI_PLATFORM_SPEC.md,
VALIDATION_WORKFLOWS.md, TEAMS_AND_ORG_PLAN.md, docs/DECISIONS.md.

---

## 1. Product thesis

An Indian exporter with 3 people does the work of 8 departments. Zimplifyed replaces the
missing 5 with AI departments: each department is a **workflow where AI does the expert
labor and the human's only job is to approve, correct, or escalate.** The unit of value is
not a feature — it is a *department run end-to-end with one approval tap per external effect*.

Non-negotiable product rules (already locked in PRODUCT_PLAN §2G/§6, restated):
1. **AI never files, sends, or pays externally without explicit human approval** (ai/approval.ts gate exists).
2. Every AI output is tagged, logged to `AiInteraction`, and feedback-captured (`AiFeedback`).
3. Guest counterparties (buyers, vendors) never need a login — tokenized links only.
4. Margin is default-visible on every priced artifact; guardrail breaches surface without clicks.
5. Every flow ships with empty state, error state, mobile layout, and an AI-drafted path
   wherever expertise is assumed (HS codes, LC clauses, GST heads, Incoterm cost lines).

## 2. Personas (unchanged core + one addition)

| Persona | Job-to-be-done | Departments they "are" |
|---|---|---|
| **Founder-owner** (2–20 ppl) | Run the whole firm; know cash, margin, risk today | All — the AI's primary principal |
| **Merchant trader** | Source, quote fast, protect thin margin | Sales, sourcing, costing |
| **Manufacturer-exporter** | Order → production → ship on time | Production, QC, packing |
| **Export ops manager** | Docs right, deadlines met, shipments moving | Compliance, logistics |
| **Overseas buyer (guest)** | See status, approve, get docs — zero friction | External; tokenized links |
| **Accountant/CA (guest-ish, NEW)** | Month-end books, GST filing, e-BRC | Finance — often an *external* CA firm; needs a scoped role, not a seat war |

The CA persona is additive, not a new module driver: it is a `finance`-scoped Membership
role plus export views (already have data-export + permissions matrix). GTM already plans a
CA-firm channel (2027Q1) — product must not block it.

## 3. Department-by-department capability map (AI-first workflow each)

Format per department: **Pipeline** (the AI-first flow) → **Autonomy** (per §4 levels) →
**Approval gates** → **Status** (exists / extend / new).

### 3.1 Sales & CRM ("Win business")
**Pipeline:** message arrives (email fwd, WhatsApp paste, web RFQ, portal import) → AI
extracts buyer + requirement (product, qty, specs, target price, Incoterm, delivery) →
dedupe against Buyer CRM → lead created with source tag → AI proposes next action (quote /
clarifying questions / decline) → AI drafts the reply → human approves → follow-up cadence
auto-scheduled with AI-drafted nudges.
**Autonomy:** L2 for intake/extraction/CRM logging (auto with review queue); L1 for any
outbound message (draft-approve).
**Gates:** every outbound email/WhatsApp; lead-decline; buyer merge when confidence < high.
**Status:** leads/buyers/quotes exist. **Extend:** RFQ spec-extraction (PLAN §A3), cadence
engine (§A2), portal importers. **New in v2:** unified inbox *ingestion* (email forwarding
address per tenant + WhatsApp Business API) — NOT a full inbox client; see §7 cuts.

### 3.2 Quoting & costing (trader core)
**Pipeline:** from extracted RFQ → AI builds cost sheet (price-list/vendor-rate prefill +
Incoterm cost lines: inland, CHA, port, freight, insurance, finance cost, RoDTEP credit-back)
→ landed margin shown inline vs `MARGIN_FLOOR_PCT` → AI drafts quote PDF + cover message →
human approves → buyer gets tokenized accept/negotiate link → negotiation replies AI-drafted.
**Autonomy:** L2 cost-sheet drafting; L1 send. Guardrail breach = hard soft-block with
owner override (exists).
**Gates:** send-to-buyer; any price below margin floor; revision of an accepted quote.
**Status:** exists — extend with RFQ→quote one-tap chain and negotiation-reply drafting.
KPI: **time-to-first-quote** is the activation metric; this pipeline is the product's spine.

### 3.3 Sourcing & vendors
**Pipeline:** need identified (from quote or order) → AI shortlists vendors by capability/
scorecard → RFQ broadcast (tokenized vendor links, no login) → quotes collected → AI
landed-cost comparison + recommendation with rationale → human awards → PO drafted.
**Autonomy:** L2 shortlist + comparison; L1 broadcast and award.
**Gates:** RFQ broadcast (external comms); award; PO issue.
**Status:** vendors/RFQs/comparison exist. **Extend:** tokenized vendor-quote submission
link (vendor portal-lite), AI shortlist + award rationale.

### 3.4 Production / order execution
**Pipeline:** order confirmed → AI generates stage plan from product type (manufacturer:
cutting→stitching→finishing→packing; trader: vendor-PO→in-production→ready→inspected) →
stage updates via one-tap mobile check-ins (photo optional) → AI detects slippage vs ship
date → drafts buyer update / vendor chaser → human approves send.
**Autonomy:** L2 plan generation + delay detection; L1 external notifications.
**Gates:** buyer-facing delay comms; QC pass/fail confirmation stays human (photo-evidenced).
**Status:** orders + tracking link exist. **Extend v2:** stage tracker, delay alerts.
**v3:** QC/AQL module, packing/cartonization, sampling (PLAN §C11–13, §B9).

### 3.5 Compliance & documents (the moat)
**Pipeline:** order + shipment data complete (DocContext fix-list already enforces this) →
AI generates the doc set (proforma/CI/PL/COO first) → rule engine + AI cross-doc consistency
pass → discrepancies as fix-list → human approves set → versioned, shareable with buyer/CHA
via token link. Parallel: compliance vault sweeps expiries (exists) and AI drafts renewal
tasks; HS assistant classifies with rationale (exists); LC upload → AI clause review →
flagged unworkable terms before acceptance.
**Autonomy:** L2 generation + checking; L1 release of docs externally; **L0 (never) for
government filings** — we prep ICEGATE/e-way data, human files.
**Gates:** doc-set release; accepting an LC; anything touching a government portal.
**Status:** DocContext step 1 shipped; steps 2–7 (templates/PDF, rule engine, AI pass,
golden evals) are the v1→v2 core, gated on design-partner data per DOC_ENGINE_SPEC.

### 3.6 Shipping & logistics
**Pipeline:** booking need → freight RFQ to forwarders (same tokenized pattern as vendor
RFQ) → rate comparison per lane → book → milestone tracking (manual updates v1, carrier
APIs v3) → buyer-visible timeline (exists) → demurrage/detention countdown alerts → AI
drafts B/L draft-approval checklist against invoice/PL.
**Autonomy:** L2 milestone inference + alerts; L1 forwarder comms and B/L approval.
**Gates:** B/L draft approval; forwarder RFQ send.
**Status:** shipment milestones + screening + track link exist. **v2:** freight desk reusing
the vendor-RFQ engine (extend, not new). **v3:** carrier APIs.

### 3.7 Accounting & GST (founder's headline example — NEW department)
**Pipeline:** snap/forward an expense (image/PDF/UPI screenshot) → AI OCR + classification
(GST head, ITC-eligible?, order attribution for P&L) → posted to expense ledger with
confidence score → low-confidence items in a review queue → month-end: AI assembles
GSTR-1/GSTR-3B *data pack* (export invoices already GST-aligned, LUT status from vault)
→ human or their CA reviews → **filing happens on the GST portal, by a human** (or via GSP
API in v3). e-BRC/FIRC reconciliation and cash-flow forecast already exist and become this
department's other half.
**Autonomy:** L2 capture/classify/post (auto-post ≥ high confidence, review queue below);
L0 filing.
**Gates:** month-end pack sign-off; any journal correction of AI postings.
**Scope discipline:** this is **NOT double-entry general-ledger accounting software.** It is
(a) expense capture with AI classification feeding Order P&L (PLAN §E26 already promises
"expense capture with OCR receipts" — this is *extend*), (b) a GST filing-prep pack, (c) the
existing receivables/realization/cash-flow stack. Full books stay in Tally/Zoho; we export
to them (CSV/Tally XML in v2). Building a GL is a company-killer distraction pre-$1M.

### 3.8 Finance, incentives & payments
Already shipped (Phase 3): incentives tracker, order P&L, e-BRC/FIRC, cash-flow forecast,
founder brief. **Extend:** AI overdue-chaser drafts (L1), forex exposure view (v2), ECGC log
(v3). Payments *execution* (collect/pay rails) is a licensed-partner play per TEAMS §2.2 —
out of product scope until 2027 PA-CB conversations mature.

### 3.9 HR / admin
**Decision: OUT as a module for launch and v2.** A 3-person firm's HR is a spreadsheet; the
capability map (A–G) never included it and no persona's primary job maps to it. What we keep:
team/roles/invites (exists), tasks/approvals (exists), audit trail (exists). Revisit only on
documented customer pull at Phase 5, and even then prefer integration over build. Payroll:
never (regulated, crowded — RazorpayX et al.).

### 3.10 The cross-cutting AI layer (what makes it "one software")
Copilot over all departments (exists, deepen), daily founder brief (exists), document
intelligence upload-anything (extend), and — the v2 keystone — the **Action Queue**: one
inbox of every AI-proposed action across departments (send quote, chase payment, renew LUT,
alert buyer of delay, post expense batch) with approve/edit/reject per item. This is how
"minimal human intervention" becomes a UI: the founder's day is the queue + the brief.

## 4. Autonomy levels & approval gates (the "minimal human intervention" contract)

| Level | Meaning | Examples |
|---|---|---|
| **L0 — Never autonomous** | AI preps, human executes outside the product | Government filings (GST, ICEGATE, DGFT), payments, LC acceptance |
| **L1 — Draft-approve** | AI drafts; explicit human approval before external effect | All outbound comms, quote/doc release, RFQ broadcast, vendor award |
| **L2 — Auto with review queue** | AI acts inside the tenant's own data; human reviews by exception | Data extraction, expense posting (high-confidence), lead logging, cost-sheet drafts, delay detection, dedupe |
| **L3 — Autonomous agents** | Multi-step with policy budget; post-hoc audit | Follow-up cadences, expiry-renewal task chains — **gated on the event stream (ROADMAP VISION §10) and ≥60% unedited-acceptance on the same task type at L1/L2** |

Promotion rule: a workflow moves up a level only when its `AiFeedback` acceptance-without-edit
rate exceeds 60% over 100+ instances AND the CFO-owned guardrail (margin/money-touching) or
compliance guardrail (doc/filing-touching) signs off. Demotion is automatic on 3 rejected
actions in a week. Every gate decision logged.

## 5. Self-serve onboarding (the exporter's first hour)

Per SELF_SERVE_PLAN §2 + specs/ONBOARDING_SPEC.md (shipped: wizard, demo seed, checklist,
magic link). The expanded-vision addition is making onboarding *department-shaped*:

1. Sign up (Google/magic link) → org wizard: business type (trader/manufacturer/both),
   what you export (AI → HS chapter pre-warm), markets (→ compliance seed via CountryPack).
2. **First-quote-in-10-minutes path (the aha):** "Paste a buyer enquiry" box on the empty
   dashboard → AI extraction → cost sheet draft → quote → shareable link. Demo data fills
   everything else.
3. Checklist v2 (one item per department): IEC/GST/AD code entered (unlocks doc engine) ·
   first quote sent · snap one expense · invite teammate or your CA · ask Copilot one question.
4. Progressive module reveal: nav starts with SELL + MONEY pinned by business type; SHIP and
   compliance modules light up when the first order exists (avoids 20-item sidebar shock).

Acceptance criteria (add to specs/ONBOARDING_SPEC.md when building step 2):
- Given a fresh tenant with no data, when the owner pastes a buyer email into the intake box,
  then a draft quote with cost lines and visible margin exists within 3 user actions.
- Given the draft, when the owner taps Send, then the buyer link works logged-out and the
  activation event fires (METRICS: time-to-first-quote).

## 6. Prioritized scope: MVP → v2 → v3

### MVP / launch (≈ now + one quarter — mostly hardening what exists)
Everything ROADMAP marks shipped, plus:
1. RFQ intake AI extraction → one-tap quote chain (closes the sales-pipeline spine).
2. DOC_ENGINE steps 2–4: PDF templates for proforma/CI/PL/COO + rule engine (with design
   partners; golden evals before public claim of accuracy).
3. Expense snap → AI classify → Order P&L attribution (the founder's accounting example,
   scoped per §3.7 — extends PLAN §E26, review queue included).
4. Copilot depth pass (verify the existing page answers the §G33 canonical questions).
5. Design-partner blockers: STORAGE_* env (risk R2), design-partner agreement (TEAMS §2.1).

### v2 (following two quarters)
Action Queue (§3.10) · unified-inbox ingestion (email-forwarding address + WhatsApp Business
API intake — not a client) · production stage tracker + delay comms · freight desk (reuse
vendor-RFQ engine) · GST filing-prep pack + Tally/Zoho export · outbound follow-up cadences
at L2→L3 pilot · forex exposure view · negotiation-reply drafting · vendor tokenized
quote-submission polish · LC-checker tool (GTM Q4).

### v3 (2027)
QC/AQL, packing/cartonization, sampling · carrier tracking APIs · GSP-partner GST filing API
· buyer discovery assistant · trade-portal lead importers · marketplace (CHAs/forwarders/
inspectors) · L3 agents on event stream · CountryPack #2.

### OUT of scope for launch (decisive cuts — revisit only on paying-customer pull)
- **Full accounting GL / double-entry books / payroll** — integrate with Tally/Zoho, never build.
- **HR module** — tasks + roles cover the 3-person firm; nothing else.
- **Full unified inbox client** (send/receive email + social DMs in-app) — ingestion only;
  we are not rebuilding Front. "Social" channels beyond WhatsApp: not even v3.
- **Payment execution rails, lending, insurance** — licensed-partner track per TEAMS_AND_ORG,
  2027+ (product exposes data hooks only).
- **Government portal auto-filing** (ICEGATE/DGFT/GST submit) — L0 forever until a partner/
  GSP integration is legally clean (v3 earliest, GST via GSP only).
- **Inventory/warehouse management** — trader flows don't need it; manufacturer pull decides v3+.
- **Native mobile apps** — PWA + mobile-usable layouts only.
- **Buyer discovery / import-data prospecting** — v3 (data-licensing cost, unproven pull).

## 7. Success metrics for the expanded vision (extends specs/METRICS_DEFINITIONS.md)
- Time-to-first-quote < 24h for ≥40% of new tenants (activation, unchanged).
- **Departments-active per tenant** (modules with ≥1 revenue-linked artifact/week) ≥4 by week 8.
- AI acceptance-without-edit ≥60% per workflow (the L-promotion currency).
- Action Queue: median founder approvals/day ≥5 with median decision time <30s (v2).
- Expense-capture coverage: % of orders with ≥1 AI-classified expense attributed (Order P&L truth).

## 8. Coordination flags
- **CFO:** margin-floor + money-touching L-promotion guardrails (§4); GST pack correctness
  liability wording; expense auto-post confidence threshold.
- **CTO:** Action Queue needs the audit→event stream (VISION §10 open item) — sequencing
  dependency; WhatsApp Business API vendor selection; GSP evaluation for v3.
- **CEO/Legal:** "not a CA/CHA, decision support" disclaimer must cover GST pack + doc engine
  before design partners (TEAMS §2.1); design-partner agreement is a launch blocker.
