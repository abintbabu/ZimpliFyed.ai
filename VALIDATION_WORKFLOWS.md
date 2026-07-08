# Zimplifyed.ai — Validation Workflows

Every end-to-end workflow the product supports (or will, per IMPLEMENTATION_PLAN), written as walkable test scripts. Use for manual QA, design-partner demos, and as the source for future Playwright specs.

**Legend:** ✅ = validatable today · 🟡 = partially built (validate what exists, note gaps) · 🔵 = planned (Wave noted) — validate after that wave ships.
**Convention:** each workflow lists Preconditions → Steps → Expected → Also verify (permissions/audit/edge cases). Run every ✅ workflow twice: as `owner` and as a restricted role, and always confirm **tenant isolation** (second tenant must never see the data).

_Created: 2026-07-08_

---

## A. Auth, tenancy & team

### WF-A1 ✅ Sign in (credentials + Google)
- **Steps:** visit `/`, sign in with username/password; repeat with Google.
- **Expected:** lands on `/dashboard`; session persists on refresh; wrong password → error, no lockout bypass.
- **Also:** signed-out user hitting `/dashboard/*` → redirected to sign-in; `/no-access` shown for user with no membership.

### WF-A2 ✅ Invite a teammate & role enforcement
- **Steps:** Users page → invite email with role (e.g. `ops`); accept invite in incognito; new user signs in.
- **Expected:** membership created with correct role; modules hidden per permissions matrix; restricted user cannot invoke owner-only actions (try direct server action / URL).
- **Also:** audit entry for invite + acceptance; duplicate invite handled; expired invite rejected.

### WF-A3 ✅ Tenant isolation (the non-negotiable)
- **Steps:** create data (lead, quote, order) in Tenant A; sign in as Tenant B user.
- **Expected:** zero Tenant A rows in any list, detail URL by ID → 404/no-access, search returns nothing, `/track` tokens from A don't leak B data.

### WF-A4 🔵 (Wave 0 / SELF_SERVE A) Self-signup → org wizard
- New email signs up → org wizard → seeded demo data → onboarding checklist visible → rate limit blocks >N attempts → ToS/Privacy links resolve to real pages.

---

## B. CRM: lead → buyer

### WF-B1 ✅ Lead lifecycle
- **Steps:** create lead (source, contact, notes) → move through pipeline stages → add task/follow-up → mark won/lost.
- **Expected:** stage changes persist and appear in audit; funnel-leak alert fires for stale leads; lost requires/records reason if implemented.
- **Also:** edit + delete permissions; empty-state renders on fresh tenant.

### WF-B2 ✅ Lead → quote handoff
- **Steps:** from a lead, create a quote (buyer details carried over).
- **Expected:** quote pre-filled with lead's buyer name; link from lead detail to quote visible.

### WF-B3 🔵 (Wave 1) Lead → Buyer conversion
- Convert lead → Buyer entity with contacts; buyer detail shows tabs (Quotes/Orders/Invoices/Activity); backfill dedupe suggests existing buyers; activity timeline logs the conversion.

### WF-B4 🔵 (Wave 1) Follow-up cadence
- Add activity with `dueAt` → appears in Tasks → AI-drafted nudge generated → human approves → logged to AiInteraction + feedback captured.

---

## C. Sourcing: vendor → RFQ → award

### WF-C1 ✅ Vendor CRUD + rates
- **Steps:** create vendor → add VendorRate with tiers (qty breaks) → edit tier → deactivate vendor.
- **Expected:** tier pricing displays correctly; deactivated vendor excluded from new RFQ pickers but history intact.

### WF-C2 ✅ Vendor RFQ broadcast & comparison
- **Steps:** create RFQ → invite ≥2 vendors → record their quotes → compare side-by-side → award one.
- **Expected:** award state visible; awarded price flows into cost sheet / quote costing; non-awarded quotes retained for history.
- **Also:** vendor invite tokens don't expose other vendors' quotes.

### WF-C3 🔵 (Wave 2) Award → vendor Work Order
- Awarded RFQ generates a `WorkOrder(kind=VENDOR_PO)`; vendor updates stages via tokenized link; delay past `plannedAt` creates a task + notification.

---

## D. Pricing & quoting (CPQ)

### WF-D1 ✅ Cost sheet build-up
- **Steps:** create cost sheet: material + packing + inland + CHA + port + freight + insurance + finance − incentive credit; switch Incoterm (EXW/FOB/CIF).
- **Expected:** landed cost recomputes per Incoterm; margin % shown against target sell price; edits persist and are audited.

### WF-D2 ✅ Quote create with line items + PDF
- **Steps:** new quote with ≥2 line items, currency ≠ INR → generate/preview PDF → send/share.
- **Expected:** totals correct (line, tax if any, grand); PDF matches on-screen; currency formatting correct.
- **Gap 🟡:** line-item **edit** after creation (Wave 0 item) — attempt edit and document current behavior.

### WF-D3 ✅ Quote → order conversion
- **Steps:** mark quote accepted → create order from it.
- **Expected:** order carries buyer, line items, values; quote status locked/linked; order number issued.

### WF-D4 🔵 (Wave 1) Product-based quote with margin guardrail
- Pick SKU from catalog → price pre-fills from buyer's price list → set price below margin floor → soft-block appears → owner override succeeds and is logged.

### WF-D5 🔵 (Wave 1) Buyer accept/negotiate link
- Share quote link → buyer (no login) accepts or requests changes → quote revises to v2 with version chain visible → expiry blocks stale link.

---

## E. Orders & execution

### WF-E1 ✅ Order lifecycle + buyer tracking link
- **Steps:** open order → update status through lifecycle → generate `/track/[token]` link → open link in incognito.
- **Expected:** buyer sees sanitized timeline (no costs/margins/internal notes); token revocation kills the link; milestones added internally appear on the link.

### WF-E2 ✅ Order P&L
- **Steps:** on an order with quote costing, record actuals → open P&L view.
- **Expected:** quoted vs actual margin shown; incentive credit included; deviations visible.

### WF-E3 🔵 (Wave 2) Production stages (manufacturer)
- Create WorkOrder(kind=PRODUCTION) with stage template (cutting→stitching→finishing→packing) → progress stages with qtyDone → completion creates StockLot → lot reserved against order.

### WF-E4 🔵 (Wave 2) Inventory receipt & reservation
- Manual stock receipt → balance by product×warehouse correct → reserve against order → movement ledger shows every change → can't over-reserve.

### WF-E5 🔵 (Wave 2) QC inspection with AQL
- Lot size → AQL calculator gives sample size/accept-reject → photo checklist → fail → reject flow; pass → buyer sign-off via track link.

### WF-E6 🔵 (Wave 2) Packing & cartonization
- Build packing list → carton weights/CBM computed → container utilization for 20'/40' shown → generates Packing List export document consistent with invoice.

### WF-E7 🔵 (Wave 2) Sampling
- Sample request → courier AWB → buyer approval → cost recovery invoiced.

---

## F. Ship & comply (the moat)

### WF-F1 ✅ Export document set generation
- **Steps:** from an order, generate proforma → commercial invoice → packing list (each doc type available).
- **Expected:** fields auto-fill from order; version increments on regenerate; status transitions (draft→final) enforced; files stored and downloadable.
- **Also 🟡:** cross-doc consistency AI (DOC_ENGINE gap) — deliberately mismatch qty between CI and PL and document that nothing catches it yet (Wave 4 target).

### WF-F2 ✅ HS code assistant
- **Steps:** describe a product → AI suggests HS code with rationale + duty/RoDTEP rate → accept.
- **Expected:** code cached to `HsCode`; rationale logged to AiInteraction; obviously-wrong description → assistant hedges rather than hallucinating confidently.

### WF-F3 ✅ Compliance vault & expiry alerts
- **Steps:** add ComplianceItem (e.g. LUT) with `expiresAt` inside the renewal window.
- **Expected:** expiring item flagged on dashboard/alerts; renewal lead-days respected; expired item visually distinct.

### WF-F4 ✅ Shipment milestones + buyer timeline
- **Steps:** add milestones (gate-in → SOB → arrival) to an order.
- **Expected:** ordered timeline internally and on `/track` link; out-of-order entry handled sanely.

### WF-F5 ✅ Denied-party screening
- **Steps:** run screening on a buyer/consignee name.
- **Expected:** result recorded to `ScreeningCheck` with timestamp (the compliance log is the product); re-screen creates new record, history kept.

### WF-F6 ✅ Letter of credit capture & clause flags
- **Steps:** create LC with terms; include a problematic clause.
- **Expected:** LC linked to order; clause flags/advisor output visible; expiry/shipment-date fields validated (shipment date after LC expiry → warning).

### WF-F7 🔵 (Wave 2) Shipment entity + demurrage countdown
- Create Shipment with ETA + free days → countdown appears → breach imminent → alert/task fires; forwarder status email pasted → AI parses into milestones.

---

## G. Money

### WF-G1 ✅ Invoice create + PDF
- **Steps:** invoice from order, multi-currency, ≥2 lines → PDF.
- **Expected:** totals/tax/currency correct; invoice number sequential per tenant; links back to order.
- **Gap 🟡:** line-item edit (Wave 0), credit notes (Wave 3).

### WF-G2 ✅ Incentive claims
- **Steps:** create RoDTEP/drawback claim on a shipped order → move claimable → claimed → received.
- **Expected:** dashboard shows money-on-the-table total; state transitions audited.

### WF-G3 🔵 (Wave 3) Payment schedule → receipt → aging
- Quote terms (30/70) auto-create schedules → record advance receipt with FX rate → aging report shows balance in the right bucket → overdue → AI chaser drafted, human-approved before send.

### WF-G4 🔵 (Wave 3) e-BRC/FIRC reconciliation
- Invoice paid → record BankRealization with FIRC ref → "unrealized proceeds" report drops it → FEMA-window countdown correct for unrealized ones.

### WF-G5 🔵 (Wave 3) Forex exposure & variance
- Open receivables grouped by currency; booked vs realized rate variance appears in order P&L after receipt.

### WF-G6 🔵 (Wave 3) Cash-flow forecast
- 13-week view = schedules in − vendor dues/expenses out + incentive pipeline; moving a due date shifts the curve.

### WF-G7 🔵 (Wave 3) Expense OCR → P&L
- Upload receipt → AI extracts amount/category → allocate to order → P&L actuals update.

---

## H. AI layer & operations

### WF-H1 ✅ Copilot Q&A over tenant data
- **Steps:** ask "which orders ship this week?", "what's my margin on <order>?", something about Tenant B's data.
- **Expected:** answers grounded in this tenant only; cross-tenant question returns nothing; interaction logged.

### WF-H2 ✅ AI guardrails
- **Steps:** trigger any AI draft (email/doc) → attempt to send/finalize.
- **Expected:** human approval step always interposed before external effect; output tagged as AI-generated in audit.

### WF-H3 ✅ Tasks & audit trail
- **Steps:** create/assign/complete a task; then open Audit page after a session of mutations.
- **Expected:** every mutation from this test session appears with actor, tenant, timestamp; no gaps for AI-initiated changes.

### WF-H4 🔵 (Wave 3) Daily founder brief
- Morning digest contains: cash position, at-risk shipments, expiring compliance, overdue receivables, stale leads, incentive deadlines — each item deep-links to its module; numbers match the underlying reports exactly.

### WF-H5 🔵 (Wave 0) Metering & AI feedback
- Every AI action writes a MeterEvent; accept/edit/reject on an AI draft writes AiFeedback; counts reconcile with AiInteraction rows.

---

## I. Cross-cutting regression sweeps (run every release)

| Sweep | What to check |
|---|---|
| **Isolation** | WF-A3 against every new module |
| **Permissions** | each new action denied for a role lacking the verb, allowed for owner |
| **Audit** | every mutating action in the release writes an AuditEntry |
| **Tokens** | all public links (`/track`, quote-accept, vendor stage, QC sign-off): expired/revoked/foreign-tenant token → safe failure |
| **Money math** | one seeded "golden order" where quote → cost sheet → invoice → P&L totals are hand-computed and asserted |
| **Empty states** | fresh tenant: every module renders guidance, no crashes |
| **Mobile** | quote create, order track, founder brief on a phone viewport |
| **PDF/docs** | golden-file comparison for CI/PL/proforma (DOC_ENGINE gate) |

## J. Suggested validation order (today, on the current build)

1. WF-A1 → A2 → A3 (foundation)
2. WF-B1 → B2 → C1 → C2 (demand + sourcing)
3. WF-D1 → D2 → D3 → E1 → E2 (the money pipeline, the demo path)
4. WF-F1 → F6 (ship & comply)
5. WF-G1 → G2 (money)
6. WF-H1 → H3 + Section I sweeps

Record results inline: append `— PASS 2026-07-08` / `— FAIL: <what broke>` to each workflow line; failures become ROADMAP risk-register or bug entries.
