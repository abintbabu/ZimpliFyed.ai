# Zimplifyed.ai — CEO Vision & Master Plan to 100,000 Users

Company-level plan. Sits above `VISION_1B.md` (revenue engines), `PRODUCT_PLAN.md` (capabilities), `ROADMAP.md` (weekly reality), `GTM_PLAN.md` (channels). Where this doc and those conflict, this doc wins and they get amended.

_Author: CEO agent · Date: 2026-07-12 · Target: 100,000 users (1 lakh) by end-2029_

---

## 1. Vision statement

> **Zimplifyed.ai is the AI-first operating system for exporters — the one piece of software an export firm needs. A founder and two employees run every department — sales, sourcing, production, docs & compliance, logistics, finance & accounting, incentives — because each department is an AI capability with a human approving, not a human doing.**

The founder's expansion ("run every department with minimal human intervention") is not a pivot; it is the natural end-state of VISION_1B's L1→L4 AI ladder. What changes with this doc: we now name the product surface as **AI-first departments** and sequence them explicitly. Each department = (a) a unified data capture surface, (b) an AI worker that does the job, (c) a human approval gate, (d) a per-outcome price. "Hire your docs person for ₹8,000/mo" generalizes to every department.

Framing rule for every roadmap debate: **we don't ship features, we ship departments.** A department ships when a 3-person firm can stop doing that job manually.

## 2. Strategic pillars

1. **Departments, not features.** Every capability maps to a department a small exporter would otherwise staff. If it doesn't replace hours of a named role's work, it's cut.
2. **The workflow is the wedge; the data is the moat.** Fintech, marketplace, and per-outcome AI pricing (VISION_1B engines 2–4) only work because the department workflows capture the data. Never ship monetization ahead of the workflow that feeds it.
3. **WhatsApp + voice is a first-class UI.** For ICP-1 the web app is the back office; WhatsApp is where the business runs. Sales-inbox unification (below) starts from WhatsApp, not email.
4. **Trust before autonomy.** Every AI action: metered, cited, approval-gated, feedback-captured (already built: `runAi()`, `AiFeedback`, approval gate). Autonomy levels rise only with measured accuracy — this is the moat and the pitch.
5. **Free where it grows users, paid where AI does work.** 100k users requires a wide free tier (CRM, tracking, tools, community bot); revenue comes from AI outcomes (doc-sets, agent-months, filings) and later fintech bps.
6. **Country-agnostic core.** Nothing India-specific outside `src/packs/in/`. Bangladesh/Vietnam packs are how users 60k→100k arrive.

## 3. The department map (the product, restated)

| Department | Human it replaces | Core AI job |
|---|---|---|
| Sales | founder-as-CRM | Unified inbox (WhatsApp + email + web RFQ) → AI reads requirement → drafts quote → plans & sends follow-ups |
| Sourcing | purchase manager | Vendor RFQ broadcast, landed-cost comparison, chase vendors on WhatsApp |
| Docs & compliance | CHA data-entry + ops manager | One-click cross-validated shipment doc-set; deadline engine; LC review |
| Logistics | shipping clerk | Milestone tracking, freight RFQ desk, demurrage countdowns |
| Finance & accounting | part-time accountant | Scan expense/invoice image → AI classifies → books entry → GST-ready export → e-BRC/FIRC reconciliation → cash-flow forecast |
| Incentives | consultant on 10% commission | Compute RoDTEP/drawback owed, prepare claims, "money left on the table" |
| Production/QC (manufacturers) | production supervisor | Stage tracking, AQL, photo-evidenced QC |

## 4. Phased master plan to 100,000 users

Users = distinct humans with accounts (tenant members + vendor-portal + buyer-workspace users + free-tool registered users). Orgs shown separately because revenue follows orgs.

### Phase 1 — "Docs department + paid launch" (now → 2026Q4) · 1,000 users / 50 paying orgs
**Ships:** DOC_ENGINE steps 2–7 with design-partner data (PDF templates, rule engine, AI consistency pass, golden evals) — the docs department is the demo that closes every sale. LC-checker tool. Design-partner cohort (10 firms, white-glove). SEO first 200 pages. Paid plans live (billing already shipped).
**Why first:** docs is where AI most visibly replaces a paid human (CHA data-entry, ₹4k/shipment), it's Phase-2/GTM-committed, and golden-eval data starts the accuracy clock for everything later. **No new departments start until doc-sets generate on real shipments.**
**Metrics:** 10 design partners live · 50 paying orgs · doc-set field accuracy ≥95% on golden set · activation (signup→first quote) ≥40% · MRR ₹3L.

### Phase 2 — "Sales department: the unified inbox" (2027 H1) · 8,000 users / 300 paying orgs
**Ships:** WhatsApp Business API 2-way integration + Gmail/Outlook sync → **one inbox**; AI requirement extraction → draft quote → follow-up cadences (the founder's sales example, verbatim). WhatsApp community bot as top-of-funnel. Excel import. Tally sync (accountant veto). SEO to 1,000 pages + tools suite complete.
**Why now:** sales is the highest-frequency department (daily use = retention engine) and WhatsApp inbox is the single biggest differentiation vs anything US-built. It also feeds the CRM data the docs department consumes — sequencing is data-flow order.
**Metrics:** week-4 retention (founder persona) ≥45% · inbox-connected orgs ≥60% of new signups · $1M ARR run-rate by 2027Q4 · organic signups ≥50%/mo of total.

### Phase 3 — "Finance department + agents" (2027 H2 → 2028 H1) · 25,000 users / 1,500 paying orgs
**Ships:** expense-scan → AI classification → books entry → GST-filing-ready export & routing to the firm's CA (the founder's accounting example; we prepare, licensed CA files — see decision log). Bank feeds (AA framework) for auto-reconciliation. First two **L3 agents**: Docs agent + Receivables agent, priced per agent-month. CA/consultant channel launches (multi-org console) — ICP-3 partners onboard 30–50 clients each.
**Why now:** finance data (expenses, realizations — bank realization tracking already shipped) is the underwriting corpus for fintech (Phase 5); the CA channel is the cheapest path from 300→1,500 orgs and the accounting feature is what makes CAs partners instead of vetoers.
**Metrics:** 50 active CA partners · agent-month attach ≥20% of paying orgs · expense-classification accuracy ≥97% · $3–4M ARR.

### Phase 4 — "Full-stack firm: production, sourcing depth, logistics" (2028) · 60,000 users / 5,000 paying orgs
**Ships:** manufacturer depth (production stages, QC/AQL, packing, sampling — PRODUCT_PLAN Phase 4), freight RFQ desk, carrier tracking APIs, mobile app (field QC), vendor portal at scale — **every vendor invited becomes a user** (the vendor-graph flywheel is the biggest user-count multiplier in the plan). Compliance and Sales agents (L3 complete). Inside-sales team on PQLs. Booths at trade fairs.
**Metrics:** vendor-portal users ≥1.5× tenant users · manufacturer persona week-4 retention ≥40% · $10M ARR · NPS ≥50.

### Phase 5 — "Money + borders" (2029) · 100,000 users / 10,000 paying orgs
**Ships:** fintech attach — cross-border collections/FX via licensed partner, marine/credit insurance one-click, invoice-financing referrals (all on data captured in Phases 1–4). First country pack (Bangladesh or Vietnam — decide 2028Q4 on corridor data). Buyer-side importer workspace (supplier-enablement: one buyer brings 50–200 exporter orgs). L4 autonomous filings where ICEGATE/partners allow.
**Metrics:** 100k registered users · 10k paying orgs · payment flow ≥$500M/yr on platform · fintech revenue ≥15% of total · 1 country pack live with ≥500 orgs.

**User math sanity:** 10k paying orgs × ~3 members = 30k; vendor-portal ≈ 40k; buyer workspaces ≈ 10k; registered free-tool/community/first-timer users ≈ 20k → 100k. India has ~150k active exporters, so 100k *users* (not exporter-orgs) is aggressive but doesn't require impossible share.

## 5. Org & resourcing plan

- **2026 (now):** founder + AI-agent leverage + 2 eng contractors as needed. Design partners are the support team's substitute. Spend: infra + Resend/Stripe/model costs only.
- **2027 (Phase 2–3):** +3 eng (1 AI/eval-focused), +1 designer, +1 onboarding/support (Hindi/Tamil), **+1 domain expert (ex-CHA or DGFT hand) — hire early, this is product**, +1 partner manager (CA channel). ~9 people at $1M ARR.
- **2028 (Phase 4):** +2 AEs (cluster-fluent), +1 fintech-partnerships lead, +2 eng, +1 success per 300 paying orgs. ~16–18 people at $10M ARR. SOC 2 complete (program starts 2027H1 per ROADMAP).
- **2029 (Phase 5):** country-pack pod (2 eng + 1 local GTM contractor per country), risk/compliance officer before fintech volume, data/eval team of 2. ~30 people at 10k paying orgs — deliberately thin; AI-first applies to us too.
- **Capital:** bootstrap/seed through Phase 3; raise Series A only after per-outcome revenue (doc-sets + agent-months) proves out in Phase 3 — best multiple, least dilution (VISION_1B §9 unchanged).

## 6. Key risks & mitigations

1. **Scope sprawl from "every department."** Highest risk of this expanded vision. Mitigation: the phase gates above are hard — no department starts before the prior phase's metric gate. Accounting does NOT pull forward into 2026.
2. **GST/accounting regulatory line.** We prepare and route; a licensed CA/GSP files. Crossing into filing ourselves is a one-way door deferred to 2028+ with counsel.
3. **WhatsApp API dependency** (pricing, policy). Mitigation: email + web inbox are peers in the unified-inbox architecture from day one; WhatsApp is a channel adapter, not the spine.
4. **AI accuracy stalls** (<98% doc fields by 2028) → per-outcome pricing stalls. Mitigation: golden evals ship in Phase 1, not later; kill criterion stands (VISION_1B §11).
5. **Horizontal AI agents commoditize form-filling.** Mitigation: vendor graph + fintech + country-pack corpus — network and data, not prompts.
6. **CA channel channel-conflict** (accounting feature threatens CAs). Mitigation: position as "we prepare, your CA files, faster" — the CA console makes them more profitable per client.
7. **Founder bandwidth / key-person.** Phase 2 hiring is the mitigation; white-glove onboarding is deliberately the research budget, not a permanent motion.

## 7. Success metrics (company-level, per METRICS_DEFINITIONS.md)

| Phase | Users | Paying orgs | ARR | North-star gate to next phase |
|---|---|---|---|---|
| 1 (2026Q4) | 1,000 | 50 | ₹36L run-rate | doc-set accuracy ≥95% + 50 paying |
| 2 (2027H1) | 8,000 | 300 | $1M run-rate | week-4 retention ≥45%, inbox attach ≥60% |
| 3 (2028H1) | 25,000 | 1,500 | $3–4M | 50 CA partners, agent attach ≥20% |
| 4 (2028end) | 60,000 | 5,000 | $10M | vendor users ≥1.5× tenant users |
| 5 (2029end) | 100,000 | 10,000 | $25–30M | fintech ≥15% of revenue |

North star metric overall: **AI-completed department-hours per org per week** (hours of work AI did that a human approved). Define formally in `specs/METRICS_DEFINITIONS.md` next revision.

## 8. Doc deltas required by this plan
- `PRODUCT_PLAN.md`: add "unified sales inbox" (WhatsApp+email+web as one surface) as the Phase-2.5 headline and "finance department / expense-scan-to-GST-routing" as a named 2027H2 module (currently only implied by §E).
- `ROADMAP.md`: NEXT list gains "DOC_ENGINE steps 2–7 with design partners" as the top item (was LATER-gated on partner data — recruiting partners is therefore the true top item, unchanged).
- `GTM_PLAN.md`: no conflict; this plan adopts its calendar and adds user-count targets.
