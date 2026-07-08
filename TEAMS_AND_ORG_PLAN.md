# Zimplifyed.ai — Teams & Operating Tracks Plan

Completes the doc stack: `VISION_1B.md` (strategy) · `GTM_PLAN.md` (demand) · `PRODUCT_PLAN.md` (build) · `SELF_SERVE_PLAN.md` (platform). This covers the seven company-side tracks those docs assume but don't plan. Each section is written as the operating plan its future leader would write, sequenced against the same milestones: **$1M ARR 2027 → $10M 2028 → $100M 2030**.

Staffing principle throughout: **founder owns every track until its trigger fires** — each section names the trigger, the first hire, and what "good" looks like at each stage.

---

## 1. Customer Success & Support

**Charter:** SMB churn is the #1 ARR risk (GTM_PLAN §10). CS exists to make the *second month* as valuable as the demo, and to turn support load into product signal.

### 1.1 Motion by stage
- **Now→$1M (founder + 1):** white-glove onboarding call offered to every signup (already GTM policy — it's the research budget). Support via WhatsApp Business (the channel customers live on) + in-app chat; email fallback. SLA: first response <2h business hours IST, resolution <24h. Every ticket tagged by module → weekly digest feeds product priorities.
- **$1→10M:** 1 CS per ~300 paying orgs (GTM_PLAN). Split roles: **Onboarding specialists** (Hindi/Tamil/Telugu; scripted 30-min setup: IEC/GST entered, first quote created, teammate invited — mirrors the in-product checklist) and **Support agents**. Add self-serve: help center (searchable, Hindi+EN), in-product guides, and — dogfooding L3 — a **support AI agent** trained on the help corpus with human escalation. Target: ≥60% ticket deflection by 2028.
- **$10M+:** pooled CS for SMB (tech-touch: lifecycle emails/WhatsApp journeys triggered by health score), named CSMs only for mid-market/trading-house and buyer-side accounts (>$5k ACV). Renewal ownership moves from "auto-charge and pray" to CSM-managed for named accounts.

### 1.2 Health score (build at ~200 paying orgs, in-product data only)
Composite per org: weekly active users / seats · revenue-linked artifacts per week (the north-star metric) · doc-sets generated vs shipments implied · onboarding checklist completion · support sentiment · payment status. Red orgs → automated WhatsApp nudge sequence, then human call. **Leading churn indicator to watch:** org stops creating quotes for 21 days (seasonality-adjusted per vertical).

### 1.3 Voice-of-customer loop (the part most companies skip)
Monthly: top-10 ticket themes + top feature-requests-by-MRR-weighted-votes reviewed with product; every churned org gets an exit call (founder does these personally until $5M — churn reasons are strategy data). NPS quarterly in-product; testimonial/case-study pipeline (GTM needs 3/quarter) is CS's harvest job.

### 1.4 Targets
Logo churn <2.5%/mo (SMB) trending to <1.5% by 2029 · NRR ≥100% by 2028, ≥115% by 2030 (fintech attach does the heavy lifting) · onboarding→activation (first quote 24h) ≥40% · CSAT ≥4.5/5.

---

## 2. Legal & Compliance (company-side)

**Charter:** stay fast without stepping on the three rakes that kill fintech-adjacent SaaS: data protection, financial regulation, and AI liability. Model: fractional counsel early, in-house late.

### 2.1 Now→$1M (fractional counsel, ~$1–2k/mo retainer)
- **Contract stack v1:** ToS + Privacy Policy (the `/signup` page links to `#` today — real docs before paid launch), DPA template (needed the day a EU-buyer-side user appears), partner/reseller agreement (before the CA-firm pilot, GTM 2027Q1), design-partner agreement (data usage + feedback IP — before 2026Q3 design partners).
- **India data law:** DPDP Act compliance program — consent records, purpose limitation, grievance officer named, data-principal rights (export/delete already planned in SELF_SERVE_PLAN §5 — legal reviews the flows).
- **IP:** trademark "Zimplifyed" (India + Madrid Protocol for expansion classes), assignment agreements from every contractor, the trade-knowledge corpus and eval datasets treated as trade secrets (access controls + confidentiality terms).
- **AI liability posture:** every AI output labeled, human-approval-before-external-effect (already a product rule — make it a ToS term), explicit disclaimer that Zimplifyed is not a licensed customs broker/CHA and outputs are decision support. This wording matters when the insurance-backed guarantee (VISION_1B §3) launches — that guarantee is a *contract*, drafted by counsel, with capped liability and claim conditions.

### 2.2 $1→10M
- **Fintech licensing roadmap (the long-lead item — start 18 months before engine 3 revenue):** payments via licensed PA-CB partners under a commercial agreement counsel negotiates (revenue share, liability split, data access); lending referrals structured as LSP (lending service provider) arrangements under RBI digital-lending guidelines; insurance distribution needs IRDAI corporate-agent or aggregator registration — **apply 2027H2** if insurance attach is a 2028 product. Decision memo each year: partner vs own license, based on volume.
- Employment law hygiene as team grows (offer letters, ESOP plan — see §5), SOC 2 contract-support (§3).
- **First in-house hire trigger:** first enterprise/buyer-side negotiation with redlines, or fintech partnership term sheets — whichever first (~2028). Hire a generalist counsel with fintech exposure.

### 2.3 $10M+ / country packs
Per-country launch checklist owned by legal: entity/tax presence decision · local data-residency law · e-signature validity for trade docs · marketing claims review · sanctions exposure (we *screen* for customers; we must also not *serve* sanctioned parties — KYB at signup for paid tiers from 2028). Add compliance officer (regulatory, distinct from counsel) when fintech volume is real (~2029, per VISION_1B §9).

---

## 3. Trust & Security

**Charter:** we hold exporters' entire commercial life — buyer lists, prices, margins, bank details. One breach ends the company; one *certification gap* blocks every enterprise and buyer-side deal. Security is a sales asset, run like one.

### 3.1 Now→$1M (engineering-owned, ~2 days/mo)
- Baseline controls: SSO+2FA on all internal tools, secrets in a manager (not `.env` files in repos), least-privilege DB access, dependency scanning + Dependabot, error monitoring with PII scrubbing, daily encrypted DB backups + quarterly restore test, offboarding checklist.
- Product security: the SELF_SERVE_PLAN §1.4 cross-tenant tests are the crown jewels — CI-blocking. Rate limiting on auth/invite/AI endpoints. Signed URLs w/ expiry for all file storage.
- **Security page on the website now** (controls, data location, subprocessors) — costs a day, wins deals; SMB buyers' CAs ask.
- Incident response plan v1 (one page: severity levels, who wakes up, customer-notification rule <72h, DPDP breach-reporting duty).

### 3.2 $1→10M
- **SOC 2 Type I → Type II (start 2027H1, Type II report in hand by mid-2028):** use a compliance-automation platform (Vanta/Drata-class), scope = production SaaS. Trigger is the first buyer-side/enterprise conversation — they will ask, and the report takes 12+ months end-to-end.
- Annual third-party pentest (before SOC 2 audit), bug-bounty-lite (security.txt + acknowledgments page).
- AI-specific: prompt-injection review of every flow that ingests untrusted docs (buyer POs, LCs — attacker-controlled content by definition); tenant-data isolation in retrieval (a Copilot answer must never cite another tenant's data — test it like cross-tenant DB access); model-provider DPAs; no tenant data in shared training without opt-in (already VISION_1B §3 — make it enforceable config).
- **First security hire trigger:** SOC 2 Type II prep or first fintech partnership security review (~2028). Security engineer, reports to eng lead.

### 3.3 $10M+
ISO 27001 (2029, for non-US buyers) · vendor security review program (we'll have 30+ subprocessors) · SIEM/log retention · red-team exercise annually · security section in every country-pack launch checklist (residency, encryption-law) · dedicated trust portal for enterprise procurement.

---

## 4. Finance & Internal Ops

**Charter:** know the unit economics cold, keep 18+ months runway visible at all times, and make the company diligence-ready continuously (fundraising is a byproduct of hygiene, not a fire drill).

### 4.1 Now→$1M (founder + outsourced accountant)
- Clean books from day one: separate business banking, accounting on Zoho Books/QuickBooks, monthly close by day 10, GST filings on calendar (eat the dogfood — track them in Zimplifyed's own compliance module).
- **The metrics sheet (weekly, one page):** MRR + movements (new/expansion/contraction/churn) · burn + runway · CAC by channel + payback · gross margin (watch AI/model costs — meter per tenant, already planned; alert if AI COGS >20% of revenue on any plan) · the GTM funnel numbers. This sheet *is* the board deck later.
- Pricing ops: Razorpay (India, UPI/netbanking) + Stripe (international) reconciliation; revenue recognition simple now (monthly SaaS), but per-outcome pricing (doc-sets) needs usage-billing hygiene from launch — bill from the metering service, never from app-side counters.
- **Fundraise posture (per VISION_1B §9):** raise Series A only *after* engine-2 per-outcome revenue proves out (~2027H2–2028). Until then: data room folder maintained continuously (cap table, financials, metrics, contracts, IP assignments) — 2 hours/month, saves 2 months during the raise.

### 4.2 $1→10M
- **First finance hire trigger:** fundraise close or 25 employees. Finance/ops generalist (controller-profile), owns close, payroll, compliance calendar, board reporting.
- Budget process: annual plan by track (this doc's sections = budget lines), quarterly reforecast. Departmental spend visibility from ~$3M.
- FX & treasury: revenue in INR + USD/AED as country packs open — simple policy (no speculation, convert on schedule, 6-month expense buffer per currency).
- ESOP administration (grants, vesting, 409A-equivalent valuations for Indian ESOP tax).

### 4.3 $10M+
CFO-track hire at ~$15–20M ARR or Series B · fintech revenue introduces partner settlements and float accounting — finance builds the reconciliation before engine 3 scales · country-pack entities (see §7) each need local books, transfer pricing between entities · audit-firm upgrade to a name investors recognize.

---

## 5. People & Talent

**Charter:** VISION_1B §9 names the team sequence; this track makes it real. The binding constraint is not money — it's that the company needs three rare profiles: engineers who ship product, a trade-domain expert, and later fintech operators.

### 5.1 Operating decisions (make now, cheap to decide, expensive to reverse)
- **Remote-first India, cluster-friendly:** talent in Bangalore/Chennai/remote; sales/CS hires *in the export clusters* (Tirupur, Karur, Panipat) — they speak the customer's language literally and figuratively. Quarterly all-hands offsite.
- **ESOP pool 12–15% at incorporation-cleanup**, standard 4-year/1-year-cliff, exercise-friendly terms (10-year window) — the plan asks people to bet on a long compounding story; the paper should honor that.
- Comp philosophy: 60–75th percentile cash for India market + meaningful equity; publish bands internally from employee #5 (avoids the negotiation-tax culture).
- **Values written when the team is 5, not 50.** Candidates: *customer's margin is sacred* (we exist to protect SMB economics) · *plain language wins* (product, docs, and internal writing) · *AI does the work, humans own the outcome* (mirrors the product guardrail).

### 5.2 Hiring sequence with triggers (consolidates all tracks)
| Trigger | Hire |
|---|---|
| now | founding eng #2–4 (full-stack, product-minded), 1 designer |
| 2026Q4 | content/community (GTM), support-who-onboards (CS) |
| ~150 paying orgs | **trade-domain expert (ex-CHA/DGFT/export-house ops)** — reports to product; reviews every doc template and AI eval; this hire is product quality |
| PQL backlog >50/mo | AE #1–2 (cluster languages), partner manager |
| 2027 | AI engineer (evals, model-router), CS #2–3 |
| fundraise / 25 people | finance generalist (§4), People-ops generalist (payroll→recruiting coordination) |
| 2028 | counsel (§2), security eng (§3), fintech partnerships lead (§6), growth marketer |
| 2029–30 | country GMs (§7), compliance officer, CFO-track, data team |

- Recruiting motion: founder sources the first 15 personally (warm network + writing-driven outbound — the plan docs themselves are recruiting collateral); structured interviews with work samples (eng: real module slice; sales: mock demo to a real exporter script); every offer has a 90-day success memo written *before* the offer.
- **Manager layer:** first eng lead promoted/hired at ~8 engineers; avoid manager-title inflation — the org stays ≤3 layers until 100+ people.

### 5.3 Retention & health
Quarterly written performance/growth conversations (lightweight, no stack ranking at this size) · attrition target <10% regretted/yr · founder does skip-levels monthly from 20 people · burnout watch on the CS/support team (the emotionally loaded seats) — rotation into product feedback work as pressure valve.

---

## 6. BD & Strategic Partnerships (fintech + institutional)

**Charter:** distinct from GTM channel partners (CA firms, EPCs — those are *sales*). This track negotiates the **infrastructure partnerships engine 3 runs on**. Long cycles (6–18 months), few deals, each worth $10M+ eventually. Founder-led until 2028, then a dedicated lead.

### 6.1 Partnership portfolio & sequence
1. **Cross-border collections/FX (start conversations 2027H1, live 2028):** shortlist licensed PA-CB / cross-border payment players; select on: revenue share to us ≥20bps, API quality, settlement speed, e-FIRC automation. Structure: referral → embedded (their rails, our UX) → co-branded. **Kill criterion mirrors VISION_1B §11:** if nobody shares ≥15bps, pivot engine 3 to financing-first.
2. **Trade finance (2027H2 →):** 2–3 invoice-financing NBFCs/fintechs as LSP partners; our pitch is underwriting data (order history, buyer payment behavior, doc quality). Start referral-fee (1–2% origination), evolve to an API marketplace where lenders bid. Data-sharing agreements need §2 counsel + explicit customer consent flows (product work — flag to PRODUCT_PLAN).
3. **Insurance (2027H2 apply, 2028 live):** ECGC relationship (institutional, slow, credibility-heavy — start early) + 1 private marine-cargo insurer with per-shipment API pricing.
4. **Logistics/carriers (2028):** container-tracking data agreements (Maersk/MSC APIs or aggregators like project44-class), forwarder demand partnerships for the freight desk.
5. **Government/quasi (opportunistic, never critical-path):** ULIP data access, ICEGATE integration as APIs mature, DGFT/commerce-ministry pilot programs — pursue for moat and credibility, but no roadmap item may *depend* on a government timeline.
6. **Model providers (ongoing):** volume pricing with 2+ LLM providers (never single-source — the model-router in VISION_1B §2 is the technical hedge; this is the commercial one).

### 6.2 Operating discipline
One-page partnership thesis before any negotiation (what we give, what we get, kill criteria, 3-year value model) · every deal gets a technical pilot with 10 design-partner tenants before GA · quarterly partnership review: volume, take rate, support burden, customer NPS on the partner-powered feature — **any partner whose feature NPS drags below product NPS gets fixed or replaced;** their failures wear our brand.

---

## 7. Country-Expansion Ops

**Charter:** the operational (not marketing) machinery behind each `CountryPack`. VISION_1B says Bangladesh/Vietnam/Turkey/Mexico from 2028–29; this is the playbook that makes each launch a repeatable 2-quarter process instead of a company-distracting adventure.

### 7.1 Launch playbook (run per country; owner: country launcher, then GM)
**Gate 0 — Select (scorecard):** exporter count × digital readiness × payment-partner availability × regulatory friction × competitive vacuum × language cost. (Expected order: Bangladesh — same doc culture, textile-heavy; UAE re-export — English, high willingness-to-pay; Vietnam; Turkey; Mexico — nearshoring wave.)
**Gate 1 — Product pack (8–10 wks, eng+domain):** doc templates + compliance calendar + incentive schemes + customs-field validation + HS localization + language pack for UI/AI. Hire a local trade-domain consultant (contract) as the §5 domain-expert analog — no pack ships without a local expert's review of every template.
**Gate 2 — Commercial pack (parallel):** pricing in local currency + local payment method · 2 signed channel partners (the CA-firm-equivalent: local accounting/customs consultancies) · 200 programmatic pages localized (GTM §4) · 1 WhatsApp/Zalo/Telegram community (channel per country norms) · 10 design-partner exporters recruited pre-launch, free, in exchange for golden eval data.
**Gate 3 — Legal/finance pack (per §2/§4):** entity-or-not memo (default: no entity until local hiring or tax nexus forces it; sell cross-border from India entity where lawful) · data-residency requirement check → deploy region if required (the multi-region checkpoint in VISION_1B §9) · tax/VAT registration where selling remotely triggers it · sanctions/KYB list updates.
**Gate 4 — Launch & measure (2 quarters):** success = 50 paying orgs + activation rate within 20% of India benchmark + a local case study. **Kill/pause criterion:** <20 paying orgs after 2 quarters → pack goes to maintenance, team moves to next country. Never run >2 country launches simultaneously before 2030.

### 7.2 Team model
2028: 1 "country launcher" (generalist operator, does Gates 1–4 with HQ support) + local contractors. First **country GM** hire when a country passes $500k ARR — owns local P&L, partners, community, support-language staffing. HQ keeps: product/eng, brand, pricing architecture, security. Local owns: partners, content localization quality, community, first-line support.

---

## 8. The company operating rhythm (binds all seven tracks + product/GTM)

- **Weekly:** metrics sheet (§4) reviewed founder + leads — one page, 30 minutes, decisions logged.
- **Monthly:** voice-of-customer review (§1.3) · pipeline/partner review · security/incident log skim.
- **Quarterly:** OKRs per track (max 3 objectives each, drawn from these docs' targets) · board update from the same metrics sheet · reforecast · one "pre-mortem" on the biggest bet of the next quarter (doc-set launch, country gate, partnership signing).
- **Annually:** strategy refresh — VISION_1B kill-criteria (§11) formally evaluated with honest numbers; this doc's hiring triggers re-checked against actuals.

Every track above deliberately names *triggers* rather than dates where possible: hiring and process follow revenue evidence, not calendar optimism. The calendar-bound items (SOC 2 start 2027H1, IRDAI application 2027H2, PA-CB conversations 2027H1) are bound because their lead times are externally fixed — those three are the ones that bite if started late.
