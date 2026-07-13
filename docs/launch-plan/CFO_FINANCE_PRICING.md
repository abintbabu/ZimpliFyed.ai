# CFO Finance & Pricing Plan — path to 100,000 users

Owner: CFO · Date: 2026-07-12 · FX assumption: **₹88 = $1** (all conversions at this rate).
Sources reconciled: `specs/BILLING_SPEC.md`, `src/lib/billing/plans.ts` (shipped entitlements), `specs/AI_PLATFORM_SPEC.md` (metering/tiered router), `GTM_PLAN.md` (funnel math, CAC targets), `ROADMAP.md` (billing Phase C shipped; Razorpay adapter NOT yet shipped — Stripe only today).

**Spec-vs-code discrepancy noted:** BILLING_SPEC names the third plan `business`; the Prisma enum/code uses `growth` (label "Business"). Keep code as-is; spec should be read as `growth`. Razorpay rail is specced but unimplemented — it is a hard blocker for INR pricing below (UPI/netbanking + GST invoices), budgeted in §4.

---

## 1. Running-cost model

### 1.1 Unit assumptions (stated, not hedged)

**Users → orgs → payers.** 1.4 users/org ⇒ 100k users ≈ 65k orgs. Monthly-active orgs = 40% of registered. Free→paid = 8% of orgs (GTM §8). Payers: **60 @ 1k users · 550 @ 10k · 5,200 @ 100k**.

**AI inference per workflow** (Claude/GPT-class list prices, tiered router per AI_PLATFORM §1; assumes prompt caching on doc-set flows):

| Flow | Tier/model class | Tokens (in/out) | Cost/call |
|---|---|---|---|
| Doc/expense image classification | extract (cheap, ~$0.8/$4 per MTok) | 3k / 0.5k | **$0.004** |
| Unified-inbox triage/reply draft | extract+draft | 4k / 0.8k | **$0.015** |
| Quote drafting | draft (mid, ~$3/$15) | 6k / 1.5k | **$0.040** |
| GST/HS routing suggestion | extract | 2k / 0.3k | **$0.003** |
| Doc-set generation + consistency pass | reason (frontier, ~$5/$25, cached) | 25k / 3k ×3 calls | **$0.55/doc-set** |
| LC review | reason | 30k / 2k | **$0.20** |

**Monthly AI COGS per active org** (consumption mix): free org (≤20 actions, no doc-sets) ≈ **$0.30**; Starter payer (150 actions + 8 doc-sets) ≈ **$2.50 (₹220)**; Growth payer (700 actions + 30 doc-sets) ≈ **$9 (₹790)**. Blended paying org: **~$5/mo**.

**Integrations:** WhatsApp Business API (Meta India): utility ₹0.78/conv, service window free-ish; assume 60 billable conv/mo per paying org ≈ **₹50 ($0.6)**. Email (Resend) ~$0.35/1k; storage (R2) ~$0.015/GB — both rounding errors until 100k.

**Infra:** Vercel + Postgres (Supabase) + R2 + Redis: $400/mo @1k, $2.5k @10k, $18k @100k (read-heavy SaaS, no GPU).

**Support:** founder-led to ~300 payers; then 1 CS per 300 paying orgs at ₹66k/mo fully-loaded ($750).

### 1.2 Monthly running cost at scale

| Line (per month) | 1k users | 10k users | 100k users |
|---|---|---|---|
| Infra (compute/DB/storage/CDN) | $400 | $2,500 | $18,000 |
| AI — free/active orgs | $85 | $840 | $9,100 |
| AI — paying orgs | $300 | $2,750 | $31,000 |
| WhatsApp API | $50 | $400 | $3,500 |
| Email + storage + monitoring | $60 | $350 | $2,500 |
| Support/CS payroll | $0 (founder) | $1,500 (2 CS) | $13,000 (17 CS) |
| Payment fees (2.4% blended) | $40 | $360 | $3,700 |
| **Total COGS+support** | **$935 (₹82k)** | **$8,700 (₹7.7L)** | **$80,800 (₹71L)** |
| Reference MRR (§3 ARPU) | $1,700 (₹1.5L) | $15,400 (₹13.5L) | $156,000 (₹1.37Cr) |
| **Blended gross margin** | 45% | 44%* | **48%*** |

\* Margin including support and free-tier AI subsidy. Pure paid-COGS gross margin is 75–82% (§3); the free tier is the marketing budget in COGS clothing — at 100k users the free-AI subsidy is $9.1k/mo ≈ CAC of $2.9 per free org/yr, far cheaper than paid acquisition.

**Guardrail (AI_PLATFORM §3):** AI COGS >20% of plan revenue per tenant → alert. At list consumption Starter runs 14%, Growth 15% — headroom exists; hard caps in `runAi` prevent whale abuse.

## 2. Pricing & packaging

Value metric = **AI outcomes** (actions + doc-sets), not seats — matches BILLING_SPEC entitlements already in code. Anchor against CHA data-entry fees (₹4,000/shipment), never against software.

| Plan | INR/mo (annual: 2 mo free) | USD/mo | Seats | AI actions | Doc-sets | Gates |
|---|---|---|---|---|---|---|
| **Free** | ₹0 | $0 | 2 | 20 | 0 | core CRM/quotes/tracking, branding on |
| **Starter** | **₹1,499** (₹14,990/yr) | $19 | 5 | 200 | 10 | + doc_generator, rfq_broadcast |
| **Growth** ("Business") | **₹4,999** (₹49,990/yr) | $59 | ∞ | 1,000 | 50 | + compliance_vault, lc_advisor, screening, custom_roles, whatsapp; branding off |
| **Enterprise** | from ₹15,000, custom | $179+ | ∞ | custom | custom | + SSO, multi-entity, SLA (2028) |

**Overage packs** (metered rail, invoiced monthly): AI actions **₹199 / 100**; doc-sets **₹99 each** (pitch line: "your CHA charges ₹4,000; we charge ₹99"). Overage COGS: ~₹4/action-pack-unit and ~₹48/doc-set ⇒ ~75% and ~51% margin respectively — doc-set overage priced for adoption, plan upgrade is the real monetization.

**Free-tier strategy to 1 lakh users:** free stays generous on viewing/CRM/first quotes/guest-buyer links (activation drivers, GTM §5); everything that scales with business value is gated. 20 AI actions ≈ one taste of every AI workflow. Powered-by branding + vendor-portal invites + referral credits (1 month or 200 AI actions both sides) are the viral loops. Free-org cost ceiling: **₹30/org/mo** — sustainable to 100k users at ₹8L/mo total free subsidy.

**Trial:** 14-day Growth-entitlement trial (already in lifecycle machine), no card required in India (card-upfront kills top-of-funnel for SMB), card required for Stripe/international.

## 3. Unit economics

| | Starter | Growth |
|---|---|---|
| Price/mo | ₹1,499 ($17) | ₹4,999 ($57) |
| AI COGS | ₹220 | ₹790 |
| WhatsApp + infra + email share | ₹95 | ₹180 |
| Payment fee 2.4% | ₹36 | ₹120 |
| **Gross margin** | **₹1,148 = 77%** | **₹3,909 = 78%** |

- **ARPU (blended, incl. overage + annual mix):** ~$28–30/org/mo.
- **CAC:** <$150/org through 2027H1 (organic/tools/community), <$400 with inside sales 2027H2+ (GTM §7). Blended plan: **$220**.
- **Churn 2.5%/mo** (GTM target) ⇒ 40-month lifetime ⇒ **LTV ≈ $29 × 78% × 40 = $905**. LTV:CAC **4.1** blended; payback **<8 months** ($220 / $22.6 monthly GM).
- **Break-even (company level):** total monthly opex ≈ COGS + payroll/marketing (§4). At ~**2,400 paying orgs / ₹60L ($68k) MRR**, gross margin covers a ~$50k/mo team — projected **2028H2**, around the 40–50k-user mark.

## 4. Funding needs & burn to 100k users

Timeline (GTM-aligned): 1k users end-2026 · 10k end-2027 ($1M ARR ≈ 1,050 payers) · 100k during 2029.

| Period | Team + mktg + COGS burn/mo | Revenue/mo (exit) | Net burn/mo (avg) |
|---|---|---|---|
| 2026H2 (founder +1, Razorpay build, design partners) | $14k | $2k | **$13k** |
| 2027 (2 AEs, 1 growth, 1 CS, 1 eng; GTM $15–25k) | $42k | $85k exit | **$28k** |
| 2028 (10–12 FTE, SOC2, partner channel) | $85k | $200k exit | **$25k → ~0** |
| 2029 to 100k users | $140k | $470k exit | cash-positive |

Cumulative net burn to break-even: **~$1.05M (₹9.2Cr)**. **Raise $1.5M seed** (18 months runway + 40% buffer for AI-price and churn risk). Milestones for the raise: 50 paying orgs (2026Q4), $1M ARR (2027Q4). If bootstrapping: cut 2027 team to 1 AE + defer paid pilots ⇒ burn ~$600k, break-even slips ~2 quarters.

**Sensitivities:** (a) AI list prices −50% by 2027 (historical trend) lifts blended GM to ~85% — do not pre-spend this; (b) churn at 4%/mo drops LTV to $565, LTV:CAC 2.6 — churn is the metric that breaks the model, not COGS; (c) INR at ₹95/$ raises AI COGS ~8% — annual-prepay push is the natural hedge.

## 5. Actions this quarter (CFO-owned)

1. Ship Razorpay adapter + GSTIN capture (BILLING_SPEC §2 step 3) — INR pricing is dead without UPI. Blocker for 2026Q4 paid launch.
2. Wire the 20%-of-revenue AI-COGS alert off MeterEvent rollup (AI_PLATFORM §3) into a weekly finance view.
3. Publish the CHA-comparison pricing page with the ₹99/doc-set anchor.
4. Instrument free-org AI subsidy as a tracked line (it is CAC; report it as such).
