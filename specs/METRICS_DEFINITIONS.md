# Spec: Canonical Metric Definitions

One vocabulary so GTM, CS, finance, and product never argue about numbers. Every metric: definition, formula, source of truth, owner. Computed from `MeterEvent` + `DomainEvent` + billing tables — **never from ad-hoc page queries**; a `src/lib/metrics/` module implements each formula once, and the weekly metrics sheet (TEAMS §4), dashboards, and board deck all read from it.

---

## 1. Funnel (GTM owns)
- **Visitor→Signup**: unique signups / unique marketing-site visitors (30d). Source attribution: first-touch UTM/landing path stored on User at creation.
- **Signup→Org (target ≥70%)**: users who complete the wizard or join an org / all new users, 7-day window. (SELF_SERVE §9)
- **Activation (target ≥40%)**: orgs creating ≥1 quote within 24h of org creation. Event: first `quote.created` DomainEvent. Secondary: 7-day activation (same, 7d).
- **PQL**: org with ≥2 active users AND (≥3 quotes OR ≥1 doc-set) within any 14-day window, not yet paying. Fires once per org (flag), routed to sales queue. (GTM §4.1)
- **Free→Paid (target ≥8%)**: orgs starting a paid subscription / orgs ≥30 days old, cohort-based by signup month — never a point-in-time ratio.
- **CAC**: fully-loaded S&M spend in period / new paying orgs in period; by-channel CAC uses first-touch attribution. **Payback** = CAC / (avg MRR × gross margin); target <6 months.

## 2. North star & engagement (product owns)
- **North star — Weekly Revenue-Active Orgs (WRAO)**: orgs generating ≥1 revenue-linked artifact (quote sent, doc-set generated, invoice issued) in the week. "Sent/generated/issued", not drafted — the artifact must have left the building or been approved.
- **Active user**: ≥1 authenticated write action in period (reads don't count; a viewer-role CA is measured separately).
- **Module adoption**: orgs with ≥3 events in a module in 28d; **modules-per-org ≥4 by week 8** is the retention proxy (PRODUCT §7).
- **AI acceptance (target >60%)**: `accepted` / (`accepted`+`edited`+`rejected`) per flow from AiInteraction; `edited` tracked separately as improvement fuel — a flow with high `edited` isn't failing, it's teachable.

## 3. Revenue (finance owns)
- **MRR**: sum of active subscription normalized monthly values + trailing-28d metered/overage revenue ÷ 1 (metered stated separately as **Usage MRR** — don't blend silently; engine-2 growth must be visible). Trials = ₹0 until converted.
- **ARR** = MRR × 12. Movements ledger monthly: new / expansion (plan-up or usage-up) / contraction / churn — from billing DomainEvents, reconciled to provider payouts.
- **NRR (target ≥100% 2028, ≥115% 2030)**: cohort MRR at month N / same cohort MRR at month 0, 12-month standard.
- **Logo churn (<2.5%/mo)**: paying orgs canceling or lapsing past dunning / paying orgs at period start. **Pause ≠ churn** (tracked as paused; >90d pause converts to churn).
- **Gross margin**: revenue − (hosting + model costs + payment fees + support tooling); **AI COGS alert** at >20% of any plan's revenue (TEAMS §4.1) — per-tenant model cost from AiInteraction.costUsd.

## 4. Health & CS (CS owns)
- **Health score (0–100)** per SELF_SERVE-era spec (TEAMS §1.2): 30% WRAO-consistency (weeks active of last 8) · 20% seat utilization · 20% doc-set-or-quote volume vs org's own baseline · 15% onboarding completion · 10% support sentiment · 5% payment status. Bands: ≥70 green, 40–69 yellow, <40 red → nudge sequence.
- **Churn leading indicator**: 21 days without `quote.created`, seasonality-adjusted per vertical (flag, not score-killer, during known off-season).
- **Ticket deflection (target ≥60% by 2028)**: AI-agent-resolved without human / total conversations. **CSAT ≥4.5**: post-resolution 1–5 prompt.

## 5. Doc/AI quality (product+eng own; the trust numbers)
- **Doc-set field accuracy**: correct fields / total fields on golden-eval runs (nightly, DOC_ENGINE §4). Published once stable — the VISION_1B §3 metric; **98% gate** for per-outcome pricing confidence (VISION kill criterion).
- **Finding precision/recall**: AI consistency findings vs golden expectations.
- **Rejection rate (real world)**: customs/LC rejections attributable to doc content per 100 doc-sets, from CS incident tagging — the insurance-guarantee actuarial input; collect from day one even while n is tiny.

## 6. Reporting cadence
Weekly one-pager (TEAMS §8): WRAO, MRR+movements, funnel steps, CAC payback, health-band distribution, top churn reasons. Monthly adds: NRR cohort table, AI acceptance by flow, gross margin. Quarterly adds: kill-criteria checks (VISION §11), channel CAC review, GEO citation share (SEO §6). Definitions change only by editing this file in a PR — the diff is the changelog.
