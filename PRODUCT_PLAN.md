# Zimplifyed.ai — Product & Development Plan

**The AI-first operating system for Indian exporters** — manufacturers and merchant traders — covering the full journey: buyer discovery → quote → order → production/sourcing → compliance & docs → shipment → payment → incentives.

Status baseline (Jul 2026): Next 16 + Prisma/Postgres + next-auth, multi-tenant, dashboard shell with Leads, Quotes, Invoices, Orders, Vendors, Tasks, Users, Settings. `MIGRATION_PLAN.md` governs the port from anabyn-website; this document governs what Zimplifyed.ai becomes.

---

## 1. Who we build for (personas)

| Persona | Profile | Primary jobs |
|---|---|---|
| **Merchant exporter / trader** | Buys from vendors, sells abroad, thin margins | Vendor sourcing & rate comparison, quote fast, protect margin, paperwork |
| **Manufacturer-exporter** | Owns production | Order → production tracking, QC, capacity, costing |
| **Export ops manager** | Runs docs & logistics | Documentation accuracy, shipment tracking, compliance deadlines |
| **Founder/owner** | Small team (2–20) | Cash flow, P&L per order, incentives owed, what to focus on today |
| **Overseas buyer** (guest) | Counterparty | Tracking links, approvals, document access — no login friction |

Design rule: **every module must be usable by a 3-person firm** — enterprise depth, SMB simplicity. AI does the expert work (HS codes, doc drafting, compliance checks) so the user doesn't need a CHA on staff for day-to-day questions.

---

## 2. Full capability map (the exporter's universe)

### A. Win business (CRM & demand)
1. **Unified leads inbox** — email, WhatsApp, website RFQ, trade-portal (IndiaMART/Alibaba/TradeIndia) imports; one `source`-tagged pipeline. *(exists — extend with importers)*
2. **Buyer CRM** — companies, contacts, buyer credit notes, communication timeline, follow-up cadences with AI-drafted nudges.
3. **RFQ intake with AI spec extraction** — paste a buyer email/PDF → structured spec (product, qty, sizes, packing, target price, delivery terms).
4. **Quote builder** — line items, Incoterm-aware cost build-up (EXW/FOB/CIF/DDP), expense% + margin% guardrails, multi-currency, PDF, buyer-shareable link with accept/negotiate. *(exists — extend)*
5. **Buyer discovery assistant** — AI research on prospective buyers (country import data hints, company vetting checklist, sanctions/denied-party screening flag).

### B. Price & source (trader core)
6. **Vendor management** — profiles, capabilities, certifications, performance scorecards (OTD, defect rate, quote responsiveness). *(exists — extend)*
7. **Vendor RFQ & rate comparison** — broadcast RFQ to shortlisted vendors, collect quotes in vendor portal, side-by-side landed-cost comparison, award.
8. **Costing engine** — product cost sheet: material + conversion + packing + inland freight + CHA + port + ocean/air + insurance + finance cost + incentives credit-back (RoDTEP/drawback) → true landed margin per Incoterm.
9. **Sampling workflow** — sample requests, courier tracking, cost recovery, approval status per buyer.

### C. Execute orders
10. **Order management** — PO capture, line items, spec sheets, amendment history, buyer-visible tracking link. *(exists — extend)*
11. **Production / procurement tracker** — stage checkpoints (manufacturer: cutting→stitching→finishing→packing; trader: PO to vendor→in-production→ready→inspected), delay alerts.
12. **QC & inspection** — AQL sampling plans, photo-evidenced checklists, third-party inspection scheduling, approve/reject with buyer sign-off.
13. **Packing & cartonization** — packing lists, carton marks, volume/weight calc, container utilization (20'/40'/40'HC/LCL).

### D. Ship & comply (the India-specific moat)
14. **Document generator** — the 20+ docs every shipment needs, auto-filled from order data, version-controlled, AI-checked for cross-document consistency (the #1 cause of customs holds & LC rejections):
    - Proforma invoice, commercial invoice, packing list
    - Shipping bill data prep (ICEGATE fields), e-way bill data
    - Certificate of Origin (incl. preferential: CEPA/FTA forms), GSP where applicable
    - LC document sets: bill of exchange, beneficiary certificate, shipment advice
    - Insurance certificate request, fumigation/phyto/health cert tracking
    - SDF/FEMA declarations, MSDS where needed
15. **HS code assistant** — AI classification with duty/RoDTEP-rate lookup and rationale; flag CTH mismatches between invoice and shipping bill.
16. **Compliance vault & deadline engine** — IEC, AD code, GST/LUT (annual renewal!), RCMC (export promotion council), FSSAI/CDSCO/BIS where relevant, buyer-required certs (OEKO-TEX, GOTS, ISO, Sedex, etc.) with expiry alerts.
17. **Incoterms & LC advisor** — AI reviews draft LC terms against the order and flags unworkable clauses before acceptance.
18. **Shipment tracking** — milestones (gate-in, SOB, transhipment, arrival, DO), container tracking via carrier APIs (phase 2), buyer-visible timeline, demurrage/detention countdown alerts.
19. **Freight & forwarder desk** — freight RFQs to forwarders/CHAs, rate history per lane, booking record, B/L draft approval workflow.
20. **Denied-party & sanctions screening** — screen buyers/consignees against public lists before shipment; log the check for compliance.

### E. Get paid & make money (finance)
21. **Invoicing** — commercial + GST invoice alignment, multi-currency, credit notes. *(exists — extend)*
22. **Receivables & payment tracking** — advance/balance schedules, LC vs TT vs DA/DP terms, e-BRC reconciliation checklist, FIRC/FIRA record, overdue AI chasers.
23. **Export incentives tracker** — RoDTEP scrips, duty drawback claims, EPCG/Advance Authorisation obligations — what's claimable, claimed, received; money left on the table surfaced on the dashboard.
24. **Forex exposure view** — open receivables by currency, realized vs booked rate variance per order; hedging reminder (no trading — just visibility).
25. **ECGC / credit insurance log** — policy, buyer limits, shipment declarations.
26. **Order P&L** — actual vs quoted margin per order, with incentive credits and forex variance included; expense capture with OCR receipts.
27. **Cash-flow forecast** — from payment schedules, vendor dues, and incentive pipeline.

### F. Run the business
28. **Tasks & approvals** — cross-module tasks, doc-approval chains. *(exists)*
29. **Team & roles** — role-based permissions (owner, ops, finance, sales, vendor, buyer-guest). *(exists — extend)*
30. **Audit trail** — every mutation logged. *(port from anabyn)*
31. **Analytics** — funnel (lead→quote→order win rate), lane profitability, buyer concentration risk, vendor scorecards, DSO.
32. **Notifications** — in-app + email + WhatsApp (buyer/vendor comms where they live).

### G. AI layer (cross-cutting — the "AI-first" in Zimplifyed.ai)
33. **Zimplifyed Copilot** — chat over your own data: "which orders ship this week?", "draft a reply to Al Noor's price pushback", "why is margin down on ORD-114?"
34. **Draft-with-AI everywhere** — quotes, invoices, emails, WhatsApp replies, LC discrepancy responses. *(pattern exists in anabyn — port)*
35. **Document intelligence** — upload any buyer PO / LC / test report → extracted, validated against the order, discrepancies flagged.
36. **Daily founder brief** — one morning digest: cash position, at-risk shipments, expiring compliance, stale leads, incentive deadlines.
37. **Guardrails** — AI never files anything with a government portal or sends external comms without explicit human approval; every AI output tagged and auditable.

---

## 3. Enterprise layout (standard shell)

Port `app-shell` from anabyn-website (per MIGRATION_PLAN §4). Structure:

```
┌────────────────────────────────────────────────────────────┐
│ Topbar: tenant switcher · global search (⌘K) · Copilot ✦ · │
│         notifications · user menu                          │
├──────────────┬─────────────────────────────────────────────┤
│ Sidebar      │  Page: PanelPageHeader (title · actions ·   │
│              │  filters) → DataTable / detail view          │
│ Home         │                                             │
│ SELL         │  Detail pages use tabbed layout:            │
│  Leads       │  Overview · Line items · Documents ·        │
│  Quotes      │  Timeline · Finance · AI                    │
│  Buyers      │                                             │
│ SOURCE       │  Right-side sheet for quick create/edit;    │
│  Vendors     │  full page for complex builders.            │
│  RFQs        │                                             │
│  Samples     │  URL state for filters/sort (shareable).    │
│ EXECUTE      │                                             │
│  Orders      │                                             │
│  Production  │                                             │
│  QC          │                                             │
│ SHIP         │                                             │
│  Shipments   │                                             │
│  Documents   │                                             │
│  Compliance  │                                             │
│ MONEY        │                                             │
│  Invoices    │                                             │
│  Payments    │                                             │
│  Incentives  │                                             │
│  P&L         │                                             │
│ OPERATE      │                                             │
│  Tasks       │                                             │
│  Analytics   │                                             │
│  Team        │                                             │
│  Settings    │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

Sidebar groups collapse; modules hidden by role and by tenant plan tier. External personas get dedicated surfaces: `/vendor-portal` (quote submission, PO acknowledgment, doc upload) and tokenized guest links `/track/[token]` (buyer order tracking, approvals) — no buyer login required.

---

## 4. Data model additions (Prisma)

Beyond MIGRATION_PLAN §2, add export-specific models:

- `Shipment` extensions: `incoterm`, `portOfLoading`, `portOfDischarge`, `vesselVoyage`, `containerNo[]`, `blNo`, `sobDate`, `etaDate`
- `ExportDocument` (typed: PROFORMA | COMMERCIAL_INVOICE | PACKING_LIST | COO | SHIPPING_BILL | BL_DRAFT | LC_DOC | CERT …) with `version`, `status`, `aiCheckResult`
- `ComplianceItem` (IEC, LUT, RCMC, certs) with `expiresAt`, `renewalLeadDays`
- `LetterOfCredit` (+ `LcClause` flags), `PaymentSchedule`, `BankRealization` (e-BRC/FIRC refs)
- `IncentiveClaim` (RODTEP | DRAWBACK | EPCG_OBLIGATION), `HsCode` cache with rates
- `FreightQuote`, `Forwarder`, `ScreeningCheck`
- `CostSheet` + `CostSheetLine` (the costing engine backbone)
- `AiInteraction` (audit of every AI draft/decision)

All rows carry `tenantId`; enforce via Prisma client extension (global where + write stamp).

---

## 5. Phased roadmap

### Phase 0 — Foundation hardening (2 wks)
Finish MIGRATION_PLAN core: app-shell port (enterprise layout above), audit trail, file storage (R2/S3), permissions matrix, tenant-scoped Prisma extension, seed data. **Exit:** demo tenant navigable end-to-end.

### Phase 1 — Trader MVP: quote-to-cash (4–6 wks)
Deepen what exists: RFQ intake w/ AI extraction (§3), vendor RFQ + rate comparison (§7), costing engine v1 (§8), Incoterm-aware quote builder, order tracking link, invoice + payment schedules (§21–22), Copilot v1 over leads/quotes/orders. **Exit:** a trader can run a full deal in Zimplifyed and know their true margin.

### Phase 2 — Ship & comply moat (6 wks)
Document generator with cross-doc consistency AI (§14) — start with proforma/CI/PL/COO; HS assistant (§15); compliance vault + deadline engine (§16); shipment milestones + buyer timeline (§18); denied-party screening (§20); LC advisor v1 (§17). **Exit:** one shipment's full doc set produced and AI-validated in-app.

### Phase 3 — Money intelligence (4 wks)
Incentives tracker (§23), e-BRC/FIRC reconciliation (§22), order P&L with incentives+forex (§26), cash-flow forecast (§27), daily founder brief (§36). **Exit:** dashboard answers "how much money am I owed, by whom, including the government."

### Phase 4 — Manufacturer depth + scale (6 wks)
Production stages & capacity (§11), QC/AQL module (§12), packing/cartonization (§13), sampling (§9), freight desk (§19), carrier tracking APIs, analytics suite (§31), WhatsApp notifications (§32).

### Phase 5 — Platform (ongoing)
Trade-portal lead imports, ICEGATE/DGFT data integrations (as APIs permit), buyer discovery (§5), plan tiers & billing, mobile PWA polish, marketplace of CHAs/forwarders/inspectors.

---

## 6. Cross-cutting engineering rules

- Strict TS, no `any`; Zod at every boundary; Server Actions return structured errors.
- RSC by default; heavy builders are client islands.
- Every AI feature: human-approves-before-external-effect, output logged to `AiInteraction`, prompt templates versioned in `src/ai/`.
- Read `node_modules/next/dist/docs/` before touching routing/APIs (Next 16 — per AGENTS.md).
- Definition of done per module: list + detail + create/edit + permissions + audit + empty states + mobile + one AI assist.

## 7. Success metrics

- Activation: tenant creates a quote within 24h of signup.
- Core value: % of orders with complete doc set generated in-app; margin-known-per-order coverage.
- AI leverage: AI-drafted artifacts accepted without edits > 60%.
- Retention proxy: weekly active modules per tenant ≥ 4 by week 8.
