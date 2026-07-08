# Spec: AI Platform (router, metering, feedback, evals, retrieval isolation)

The shared infrastructure every AI feature rides on (VISION_1B §2 "build once"). Two pieces are day-one imperatives (§10): **metering** and **feedback capture** — small schema, compounding value. Current state: `src/actions/ai.ts` + copilot page exist; no metering, no feedback, no router.

---

## 1. Model router — `src/ai/router.ts`
Single entry: `runAi(task: AiTask)` where task carries `{ flowId, tier: 'extract'|'draft'|'reason', input, tenantId, userId, schema? }`.
- Tier→model map in config (env-overridable): `extract` → cheap/fast model, `draft` → mid, `reason` (LC review, doc consistency) → frontier. **Two providers minimum** (Anthropic + one other); per-tier fallback chain on 5xx/overload.
- Every call: structured-output enforcement (Zod → JSON schema), timeout, one retry with backoff, cost computed from token usage × price table.
- Prompts live in `src/ai/prompts/{flowId}/vN.md` — versioned files, `flowId+version` recorded per interaction. No inline prompt strings in actions.

## 2. AiInteraction (audit + the eval corpus seed)
```prisma
model AiInteraction {
  id String @id @default(cuid())
  tenantId String; userId String?
  flowId String; promptVersion String; model String; tier String
  inputSummary Json      // redacted/truncated input fingerprint
  output Json
  latencyMs Int; inputTokens Int; outputTokens Int; costUsd Decimal
  feedback AiFeedback?   // accepted | edited | rejected
  editedOutput Json?     // what the human changed it to (the gold)
  createdAt DateTime @default(now())
  @@index([tenantId, flowId, createdAt])
}
```
**Feedback capture (§3 of VISION_1B §10):** every AI-drafted artifact UI gets three affordances — use as-is (`accepted`), edit-then-use (`edited`, store final), discard (`rejected`, optional reason). Ship as one shared component (`<AiDraftActions interactionId/>`) so no flow forgets it.

## 3. Metering & budget
`MeterEvent { tenantId, kind, quantity, refId?, createdAt }` — kinds now: `ai.action`, `docset.generated`, `agent.task` (future), `shipment.tracked`. Written in the same transaction as the work. Monthly rollup view feeds: plan limits (BILLING_SPEC gates on rollup), admin-console cost dashboards, gross-margin alert (finance: AI COGS >20% of plan revenue → alert). Per-tenant budget caps: soft (banner at 80%) and hard (upsell screen, `requireFeature` pattern) — enforced in `runAi` before the model call.

## 4. Retrieval layer (Copilot + agents)
- Tenant data: retrieval functions are **normal Prisma queries through the tenant-scoped client** — isolation inherited structurally, not prompt-promised. Copilot tool-use only calls whitelisted read functions; each declares required `Permission` and checks the caller's role (a sales user's copilot cannot fetch margin data — mirrors SELF_SERVE §3.2 redaction).
- **Trade-knowledge corpus** (proprietary IP): `KnowledgeChunk { packId, sourceRef, title, text, embedding vector, effectiveFrom, supersededAt }` — FTA texts, duty schedules, DGFT circulars, port procedures. Weekly ingestion job (manual curation queue first; domain-expert hire reviews). Every AI answer citing the corpus includes `sourceRef` → rendered as citation chips (trust moat, VISION_1B §3).
- Prompt-injection posture: untrusted document text (buyer POs, LCs) is always wrapped in delimited data blocks with an instruction-immunity preamble; tool-use flows treat extracted text as data, never as instructions; red-team fixtures in the eval set (SECURITY_BASELINE §5).

## 5. Eval harness
`src/tests/ai/` — per flow: fixture inputs + scored expectations. Two classes: **exact/structural** (extraction fields, HS suggestions vs known-good) and **judged** (drafts scored by a judge prompt on rubric). Nightly CI job, per-flow scorecard trending in admin console. Feed sources: golden files (DOC_ENGINE §4), `edited` AiInteractions (diff = what the model got wrong), rejected+reason. Rule: **no prompt-version bump ships without an eval run** ≥ previous score.

## 6. Event stream (VISION_1B §10 #4)
Minimal now: `DomainEvent { tenantId, type, refId, payload Json, createdAt }` written alongside audit entries for key mutations (order.created, quote.sent, invoice.paid, docset.approved, milestone.reached). Consumers: onboarding checklist, health score (CS), future webhooks/agents. Postgres table + polling worker is fine until ~$5M ARR (per TEAMS §9's checkpoint) — no queue infra yet.

## 7. Build order
1. Migration: AiInteraction, MeterEvent, DomainEvent, KnowledgeChunk (pgvector).
2. `runAi` router; migrate `src/actions/ai.ts` flows onto it.
3. `<AiDraftActions>` + wire into existing draft surfaces.
4. Meter writes + monthly rollup + soft cap.
5. Copilot retrieval whitelist w/ permission checks.
6. Eval harness skeleton + first fixtures for the 2 highest-volume flows.
7. Corpus ingestion v1 (manual upload + chunking + citations).
