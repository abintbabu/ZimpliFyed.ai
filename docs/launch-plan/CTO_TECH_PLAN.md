# CTO Technical Development Plan — Zimplifyed.ai at 100k Users

_Author: CTO · 2026-07-12 · Source of truth for the "AI-first exporter OS" build-out.
Companion docs: ROADMAP.md (live status), IMPLEMENTATION_PLAN.md (module-level how),
specs/AI_PLATFORM_SPEC.md, specs/SECURITY_BASELINE.md, docs/DATABASE_PLAN.md._

## 0. Vision restated as an engineering target

Every exporter department runnable with minimal human intervention:

- **Finance**: expense image → vision extract → AI classify → ledger entry → GST return draft.
- **Sales**: unified inbox (email + WhatsApp + social) → CRM auto-tracking → requirement
  extraction → quote draft from price list/cost sheet → follow-up planning → send on approval.
- **Ops/Docs**: order → doc-set generation → cross-doc consistency → shipment tracking → alerts.
- **Compliance**: screening, licence expiry, e-BRC/FEMA timelines — already largely built.

The architectural implication: we are not adding "AI features" to a CRM; we are building an
**event-driven agent platform** where modules (already ~70% ported) become tools that agents
call, gated by the human-approval layer (`src/ai/approval.ts`) that already exists.

What we have today (do not rebuild): `runAi()` router with tiers/fallback/budget, AiInteraction
+ AiFeedback + MeterEvent + DomainEvent, pgvector retrieval with tenant scoping, eval harness,
CountryPack registry, tenant-scoped Prisma client, billing/entitlements, doc-engine DocContext.

---

## 1. Target architecture

### 1.1 AI platform (extends AI_PLATFORM_SPEC — amend that spec as pieces land)

**Model router (exists, harden).** Keep `runAi(task)` as the single entry. Additions for scale:
- Per-tier provider pools with health-weighted routing (not just fallback-on-5xx); latency SLO
  per tier (`extract` p95 < 3s, `draft` < 8s, `reason` < 20s) recorded on AiInteraction.
- Prompt caching (Anthropic cache control) for corpus/system prompts — this is the single
  biggest inference-cost lever (~50-80% off input tokens on repeat flows).
- Batch tier for non-interactive work (nightly classification, corpus refresh) at ~50% price.

**Document/vision pipeline (new — the expense-scan and PO-parse backbone).**
```
upload (R2/S3 signed URL) → virus/type check → queue job →
  vision extract (tier: extract, image/PDF → structured Zod schema) →
  classifier (expense category / doc type / GST rate) →
  confidence gate: ≥ threshold → auto-record + DomainEvent
                   < threshold → human review queue (<AiDraftActions>) →
  route: Expense → GST ledger · PO → quote/order draft · LC → LC review
```
One pipeline, many document types, registered like CountryPack manifests
(`src/ai/pipelines/{docType}.ts` with schema + prompt version + confidence policy).
Every extraction writes AiInteraction; edited corrections feed the eval corpus automatically.

**Agent orchestration (new).** Deliberately boring v1:
- `AgentRun { tenantId, agentId, trigger, steps Json, status, approvals }` — a durable,
  resumable step log, not a framework. Each step = one `runAi` call or one whitelisted tool
  (server action wrapped with permission check, same whitelist as Copilot retrieval).
- Triggers: DomainEvents (quote.sent + 3 days silence → follow-up draft), inbox messages,
  cron. Consumers poll the DomainEvent table now (spec §6 says fine until ~$5M ARR); swap the
  poller for a real queue (see §3) without changing producers.
- **Autonomy ladder** per flow: L0 draft-only → L1 auto with review queue → L2 auto with
  audit-only, promoted per-flow only when eval pass rate and tenant acceptance rate clear
  thresholds (acceptance ≥ 90% over 200 interactions). Money-moving and government-filing
  actions are permanently L0/L1 — a human clicks before GST filing or payment.

**Retrieval isolation (existing pattern, enforce harder).**
- Tenant data: only via tenant-scoped Prisma client through permission-checked tool functions
  (structural isolation, never prompt-promised). No tenant text ever enters `KnowledgeChunk`.
- Corpus: pack-scoped (`packId`), citation chips mandatory.
- At 10k+ tenants: partition pgvector indexes; move embeddings search to a `tenantId`-filtered
  HNSW index and add the cross-tenant retrieval test to the CI-blocking suite (SECURITY §2).

**Unified inbox architecture.**
- `Channel { tenantId, kind: gmail|imap|whatsapp|instagram|webform, credentials(enc), status }`
- `Conversation { tenantId, channelId, buyerId?, contactId?, externalThreadId }` +
  `Message { conversationId, direction, body, attachments, aiExtract Json? }`
- Ingestion workers normalize all channels into Message; an `extract` -tier call per inbound
  message produces intent + entities (product, qty, incoterm, urgency) → links/creates
  Lead/Buyer/Activity → optionally kicks a quote-draft AgentRun.
- Outbound always through the approval gate initially; per-tenant setting to promote.

### 1.2 Application architecture at scale

```
Vercel (Next.js 16, app router)        ── UI + server actions + route handlers
Worker fleet (Node on Fly/Railway/ECS) ── queue consumers: ingestion, pipelines, agents, crons
Postgres (Supabase → dedicated)        ── OLTP + pgvector + DomainEvent
Queue: pg-boss on Postgres now → SQS/Upstash QStash at ~10k users
R2/S3                                  ── files (adapter exists in storage.ts)
Redis (Upstash)                        ── rate limits, hot cache, budget counters (at 10k)
ClickHouse or Tinybird (at 10k+)       ── AiInteraction/MeterEvent analytics offload
```

Rule: Vercel serves humans; workers serve machines. No long-running AI/agent work inside
Vercel function limits — everything async goes through the queue with idempotency keys.

---

## 2. Integrations plan

| Integration | Approach | Notes / gotchas |
|---|---|---|
| **Gmail** | Gmail API + OAuth, `watch()` push via Pub/Sub → webhook → queue | Google security review (CASA) needed for restricted scopes — start 8-12 wks before launch; store tokens encrypted (KMS), per-tenant |
| **IMAP/SMTP** (Zoho, Outlook, generic) | IMAP IDLE workers per mailbox, fallback poll 2-min | Long-lived connections = worker fleet, not serverless; cap mailboxes/worker |
| **WhatsApp Business** | Meta Cloud API (not on-prem); BSP fallback (Gupshup/AiSensy) if Meta review stalls | Template approval workflow needed; 24-hr session window logic in Conversation model; conversation-based pricing feeds MeterEvent |
| **GST** | GSP partner (MasterGST/Cygnet/ClearTax APIs) — do NOT integrate NIC directly | GSTR-1/3B draft from ledger, e-invoice IRN, e-way bill. Filing is always human-approved (L0). OTP-based taxpayer auth per tenant |
| **Banking** | Phase 1: statement upload (PDF/CSV) → vision pipeline → BankRealization matching (extends existing recon). Phase 2: Account Aggregator (Setu/Finvu) for read-only feeds | AA is the DPDP-clean path; direct bank APIs per-bank is a swamp — avoid. Payments stay Stripe/Razorpay per BILLING_SPEC |
| **Carriers/tracking** | Aggregator (project44/Vizion/SeaRates) per IMPLEMENTATION Wave 4 | Manual + AI paste-parse bridges until then |
| **DGFT/ICEGATE** | Scrape/manual + corpus ingestion for circulars; e-BRC status via DGFT portal automation later | No stable public APIs; keep human-in-loop |

All integrations follow one pattern: `Channel`/`Connection` record with encrypted credentials,
webhook or worker ingestion → queue → normalized event → DomainEvent. Secrets in a real secret
manager (not just Vercel env) once worker fleet exists.

---

## 3. Scaling path: current stack → 100k users

Assume ~100k users ≈ 15-20k tenants, ~8-12k DAU, exporter usage is bursty 9am-9pm IST.

**Stage A — now → 1k users (0-6 mo).** Current stack unchanged. Add: pg-boss queue on
Postgres, one worker dyno, Supabase Pro→Team, Sentry, expand-contract migration discipline
(per DECISIONS 2026-07-11 debt), cross-tenant tests CI-blocking. Cost of change: ~2 wks.

**Stage B — 1k → 10k (6-18 mo).** Supabase dedicated compute (8-16 vCPU) + 2 read replicas
(dashboards/analytics reads); PgBouncer already in place. Redis for rate-limit/budget counters.
Queue → SQS/QStash. Worker fleet autoscaled (ECS/Fly, 5-15 nodes). Offload
AiInteraction/MeterEvent/DomainEvent analytics to ClickHouse/Tinybird; keep 90 days hot in PG.
Table partitioning by month on the three firehose tables. Vercel Enterprise or move heavy
SSR to ISR/edge caching on marketing+tools pages.

**Stage C — 10k → 100k (18-36 mo).** Postgres: move off Supabase to RDS/Aurora or Supabase
enterprise; partition hottest tenant tables by hash(tenantId) if needed — **stay single-DB
schema-shared**; do not shard-per-tenant (operational suicide at 20k tenants). pgvector →
dedicated vector store only if corpus > ~50M chunks (unlikely; corpus is pack-level, small).
Regional note: primary region Mumbai (ap-south-1) for DPDP posture + latency; Vercel functions
pinned bom1. CDN for all static/marketing. Target p95 < 500ms interactive, doc-gen < 5s.

Explicit non-goals: no microservices, no Kubernetes before 10k, no event bus (Kafka) before
Stage C, no rewrite off Next.js. The monolith + workers + queue shape holds to 100k.

---

## 4. Security & compliance baseline (DPDP Act + isolation)

SECURITY_BASELINE.md remains the floor; additions for this vision:

1. **DPDP Act (DPDPA 2023 + 2025 rules)**: we become a Data Fiduciary holding buyer PII,
   bank data, GST credentials. Required: consent records for channel connections, purpose
   limitation per integration, data-principal rights endpoints (export exists via BILLING
   data-export; add deletion cascade verification test), breach notification <72h (runbook
   exists in SECURITY §5), India data residency for the primary DB (Mumbai region — do this
   at Stage B migration, cheap then, expensive later).
2. **Credential vault**: OAuth tokens / GSP creds / WhatsApp keys encrypted with per-tenant
   data keys (envelope encryption, KMS). New spec section in SECURITY_BASELINE when built.
3. **Isolation, mechanically enforced**: lint rule banning `prismaUnscoped` outside
   platform-admin/jobs (spec'd, verify it exists); CI cross-tenant read+write test per action
   file becomes merge-blocking before design partners — this is the zero-incident KPI's
   backbone. Agent tool whitelist inherits the same permission matrix.
4. **AI-specific**: prompt-injection fixtures for inbox messages (hostile buyer email
   attempting exfiltration) added to eval CI before unified inbox ships; per-tenant
   no-training DPAs with all model providers; AI cost anomaly alert (10× baseline).
5. **SOC 2** per existing timeline (program 2027H1, Type II mid-2028); ISO 27001 optional
   after. GST/banking integrations will trigger enterprise-buyer security questionnaires —
   the `/security` page and subprocessor list must exist before GSP go-live.

---

## 5. Team & hiring plan (engineering)

| When | Headcount (cum.) | Roles |
|---|---|---|
| Now → design partners | 1 (founder-CTO + AI agents) | Current mode is viable through Wave 4 |
| Paid launch, ~200 tenants | 3 | +1 full-stack product eng, +1 AI/platform eng (owns router, pipelines, evals) |
| 1k users | 5 | +1 integrations eng (Gmail/WhatsApp/GSP — this is a full-time surface), +1 full-stack |
| 10k users | 9-10 | +1 infra/SRE (owns workers, DB, on-call), +1 AI eng, +1-2 product eng, +0.5 QA-automation; domain expert (customs/GST) as reviewer for corpus — contract |
| 100k users | 18-22 | Teams: AI platform (4), integrations (4), product (6), infra/SRE (3), security eng (1, per TEAMS 2028 trigger), eng manager ×2 |

Hiring order rationale: integrations eng before more product eng — inbox/GST/WhatsApp are
long-tail maintenance surfaces that will otherwise consume the founder. India-based team,
Mumbai/Bangalore/remote; blended cost assumption ₹35-60L/yr senior, ₹18-30L mid.

---

## 6. Phased build sequence (effort in eng-weeks, current 1-eng mode ≈ AI-augmented)

**Phase I — Foundation hardening (3-4 wks).** pg-boss queue + worker process; expand-contract
migration tooling; cross-tenant CI tests; credential vault primitive; storage env to R2 (R2
risk closes); Sentry. _Gate: nothing async ships without this._

**Phase II — Document/vision pipeline + Expense→GST (5-6 wks).** Pipeline framework, expense
scan flow (extends existing `Expense.ocrData` plan from IMPLEMENTATION Migration 3), review
queue UI, GST ledger model, GSTR-1 draft export (file-manually first; GSP API behind it in
Phase IV). Evals: extraction accuracy fixtures day one.

**Phase III — Unified inbox + sales agent (8-10 wks).** Channel/Conversation/Message models;
Gmail OAuth + IMAP worker; requirement-extraction flow → Lead/Buyer linking; quote-draft agent
(L0) reusing quote builder + price lists; follow-up planner off DomainEvents. WhatsApp Cloud
API second (Meta review runs in parallel from week 1). _This is the flagship demo._

**Phase IV — GSP + banking ingestion (5-6 wks).** GSP partner integration (e-invoice IRN,
GSTR draft push), bank-statement pipeline → BankRealization auto-matching, AA integration
scoped as spike. Human approval on all filings.

**Phase V — Agent orchestration GA + autonomy ladder (4-5 wks).** AgentRun model, trigger
engine, per-flow autonomy promotion with eval/acceptance gates, admin console agent scorecard.

**Phase VI — Scale-out (recurring).** Stage B infra moves, analytics offload, carrier APIs,
Copilot v2 tool-use across modules. Interleaved with GTM-driven module work (IMPLEMENTATION
Waves 2/4 remainder: production, inventory depth).

Total to flagship-vision-demonstrable: ~6-7 months in current mode; halves with the first two
hires. IMPLEMENTATION_PLAN wave gates (golden evals before doc templates, CountryPack before
new country logic) remain hard gates.

---

## 7. Top technical risks

1. **Cross-tenant leak via AI/agent path** — highest-severity, kills the company. Mitigation:
   structural isolation only, CI-blocking tests, prompt-injection evals, agent tool whitelist.
2. **Integration platform risk** — Google CASA review delays (start early), Meta WhatsApp
   policy shifts, GSP API quality. Mitigation: BSP fallback, GSP dual-vendor contract,
   ship manual-upload paths first so no feature hard-depends on an external approval.
3. **AI unit economics** — inference cost per tenant-action exceeding plan margin. Mitigation:
   metering already in place; prompt caching + batch tier + tier-appropriate models; gross-
   margin alert at AI COGS > 20% of plan revenue (AI_PLATFORM §3). Track cost/tenant-action
   weekly (KPI).
4. **Autonomy errors on money/compliance actions** — wrong GST figure filed = trust gone.
   Mitigation: permanent L0/L1 on filings/payments, golden-file evals, confidence gates.
5. **Single-founder bus factor + on-call** through 1k users. Mitigation: runbooks, boring
   infra, hire SRE-minded eng early at Stage B.
6. **Postgres write firehose** (Message/AiInteraction/DomainEvent at 100k). Mitigation:
   partitioning + analytics offload planned at Stage B, before it hurts.
7. **DPDP enforcement tightening** (2025 rules phasing in). Mitigation: Mumbai residency at
   Stage B, consent records from day one of inbox launch.

---

## 8. Running-cost estimates (monthly, USD; ₹ at ~86/USD) — for the CFO

Assumptions: users→tenants ≈ 5:1; active tenant does ~600 AI actions/mo at maturity
(inbox extraction ~10-15/day dominates, drafts ~5/day, reasoning ~1/day); blended model cost
per action after prompt caching ≈ $0.004 (extract) / $0.02 (draft) / $0.10 (reason);
WhatsApp conversation fees passed through or plan-capped. ±35% error bars — metering data
(MeterEvent) replaces these assumptions within one quarter of each stage.

| Component | 1k users (~200 tenants) | 10k users (~2k tenants) | 100k users (~18k tenants) |
|---|---|---|---|
| AI inference (all tiers, cached) | $1,200 | $11,000 | $85,000 |
| Embeddings + vector | $50 | $300 | $1,500 |
| Postgres (Supabase→dedicated) | $150 | $1,200 | $9,000 |
| Vercel | $150 | $1,500 | $8,000 |
| Workers/queue/Redis | $100 | $900 | $6,000 |
| Storage/CDN (R2) | $30 | $300 | $2,500 |
| ClickHouse/analytics | — | $500 | $3,000 |
| WhatsApp/comms (net of pass-through) | $100 | $800 | $6,000 |
| GSP + integration vendor fees | $150 | $900 | $5,000 |
| Observability (Sentry etc.) | $80 | $500 | $3,000 |
| **Total / month** | **~$2,000** | **~$18,000** | **~$129,000** |
| **₹ / month** | **~₹1.7L** | **~₹15.5L** | **~₹1.11Cr** |
| Per user / month | $2.00 | $1.80 | $1.29 |
| Per tenant / month | ~$10 | ~$9 | ~$7 |

Read for pricing: infra+AI COGS ≈ $7-10/tenant/mo → plans priced ₹2-8k/mo hold 85%+ gross
margin. Biggest sensitivities: (a) inbox message volume per tenant (linear in extract calls —
cap free-plan channels), (b) prompt-cache hit rate, (c) reason-tier creep (enforce tier
discipline in code review + router config, not developer choice).

---

## 9. Spec/doc changes this plan implies (do in the same PRs as the code)

- AI_PLATFORM_SPEC: add §8 pipelines, §9 AgentRun/autonomy ladder, §10 unified-inbox models.
- SECURITY_BASELINE: add credential-vault + DPDP-consent sections.
- BILLING_SPEC: channel-count and message-volume gates; WhatsApp pass-through metering kind.
- New spec when Phase III starts: `specs/INBOX_SPEC.md`.
- DATABASE_PLAN: refresh after each migration wave (it's already behind schema.prisma).
