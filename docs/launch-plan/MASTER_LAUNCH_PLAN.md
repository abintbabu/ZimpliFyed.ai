# Zimplifyed.ai — Master Launch Plan to 1 Lakh Users

Synthesis of the five CXO plans in this directory (2026-07-12). Read the role docs for detail; this file is the single view and the reconciliation record.

## Vision (CEO)

One AI-first operating system where a 3-person export firm runs every department. Each department = data capture + AI worker + human approval gate + per-outcome pricing. This is not a pivot from VISION_1B — it is its L1→L4 autonomy ladder sequenced as departments, in data-flow order, with hard metric gates between phases.

North-star metric: **AI-completed department-hours per org per week.**

"1 lakh users" = verified accounts; at ~2.4 users/org that is **~42,000 exporter orgs by 2029 H2** (CMO model, adopted company-wide).

## Phase plan (all roles aligned)

| Phase | Window | Department shipped | Users (orgs) | Growth channels | Revenue gate |
|---|---|---|---|---|---|
| 1 | 2026 Q4 | Docs dept (DOC_ENGINE 2–7), paid launch | 1k (~420) | Waitlist, design partners | 50 paying orgs |
| 2 | 2027 H1 | Sales dept: unified WhatsApp+email inbox → CRM → AI quote → follow-ups | 8k | SEO/tools, referrals | $1M run-rate |
| 3 | 2027 H2–2028 H1 | Finance dept: expense-snap → classify → book → route to CA; first L3 agents | 25k (~10k) | CA-partner channel opens | Break-even ~2,400 payers (2028 H2) |
| 4 | 2028 | Production/QC, freight desk, mobile, vendor portal | 60k (~14.5k end-2028) | CA/CHA partners GA, vernacular | $10M ARR |
| 5 | 2029 | Fintech attach (FX, insurance, financing), country pack, buyer workspace | 100k (~42k) | Compounding SEO+GEO, 150 partners | 10k paying orgs / ≥3,500 (see reconcile #3) |

Phase-gate rule: no department starts early without a paying-customer commitment.

## Product (CPO)

- 8 AI-run departments extending the existing A–G capability map; HR and general ledger are **cut** (Tally/Zoho export instead).
- Autonomy ladder L0–L3 with measurable promotion: ≥60% unedited AI acceptance + guardrail sign-off. Government filings and payments are L0/human-approved **permanently** (matches CTO + CEO one-way decisions: GST is prepare-and-route, never direct filing).
- Unified inbox = ingestion only (forwarding address + WhatsApp Business API); no in-app mail client.
- v2 keystone: cross-department **Action Queue** — founder's day becomes queue + daily brief. Depends on CTO event stream.
- Onboarding aha: "paste a buyer enquiry → quote in 3 actions," first quote ≤24h.

## Technology (CTO)

- Event-driven agent platform on the existing substrate (runAi router, metering, DomainEvents, approval gate, tenant-scoped Prisma). Monolith + worker fleet + queue to 100k — no microservices, no sharding.
- Adds: document/vision pipeline, unified inbox, durable AgentRun orchestrator with per-flow autonomy ladder.
- Integrations: GST via GSP partner; banking via statement upload → Account Aggregator; WhatsApp Cloud API with BSP fallback (channel adapter, never a structural dependency — CEO one-way decision).
- Build sequence: foundation (3–4 wk) → vision pipeline + expense→GST (5–6) → unified inbox + sales agent (8–10) → GSP/banking (5–6) → agent GA (4–5).
- Hiring 1→3→5→10→~20; integrations engineer before more product engineers. Mumbai data residency at Stage B; DPDP baseline; Google CASA review (8–12 wk lead) blocks Gmail launch.

## Money (CFO)

Pricing (AI-outcome metered; overage ₹199/100 actions, ₹99/doc-set vs ₹4,000 CHA anchor):

| Plan | INR/mo | Seats | AI actions | Doc-sets |
|---|---|---|---|---|
| Free | ₹0 | 2 | 20 | 0 |
| Starter | ₹1,499 | 5 | 200 | 10 |
| Growth | ₹4,999 | ∞ | 1,000 | 50 |
| Enterprise | ₹15,000+ | ∞ | custom | custom |

- Paid gross margin 77–78%; LTV $905, blended CAC $220/org, LTV:CAC 4.1, payback <8 mo.
- Break-even ~2,400 paying orgs (2028 H2). Raise **$1.5M seed** against ~$1.05M burn to break-even.
- **#1 revenue blocker: Razorpay adapter is unbuilt (Stripe-only today).**

## Growth (CMO)

- Positioning: "AI-first exporter OS" vs Zoho/Tally/IndiaMART/Excel. Claim rule: market only what's live ("coming vs here").
- ICP: ~1.5 lakh active Indian exporters, ~90k new IECs/yr, ~8 lakh reachable SMBs.
- Channel evolution: waitlist/design partners → SEO + free tools (2k pages, ≥10% tool→signup) + Hindi YouTube → CA/CHA/freight-forwarder partners (≥12% partner-sourced) → flywheels; no channel >50% at scale.
- Funnel gates: activation (first quote ≤24h) ≥40%; free→paid ≥8%; blended CAC/user ₹120→₹70.

## Reconciliation items (owner: CEO)

1. **Cost model divergence**: CFO models $935/mo at 1k users; CTO models ~$2k/mo (±35%). Adopt the CTO number for burn planning (it includes AI inference headroom) until real metering data replaces both; CFO margins survive either case.
2. **User-count basis**: CFO's break-even (2,400 payers) is in orgs; CMO's milestones are in users. Company standard: report orgs internally, users externally, 2.4 users/org conversion.
3. **2029 paying-org target**: CEO says 10,000 paying orgs; CMO gates on ≥3,500. Treat 3,500 as the gate (must-hit) and 10,000 as the plan (target); revisit at Phase-4 review.
4. **Payment rails**: Razorpay adapter (CFO blocker) must enter the CTO foundation phase, before the 2026 Q4 paid launch.

## Founder decisions required before execution (not taken by agents)

- Confirm INR price points and no-card India trial before 2026 Q4 paid launch.
- Approve publishing pricing pages, public waitlist on zimplifyed.ai, and any paid ad spend (irreversible-class).
- Sign off design-partner agreement + product disclaimers (legal launch blockers).
- Approve $1.5M seed raise plan (Series A only after Phase-3 per-outcome revenue proves).
