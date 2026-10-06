# Build Roadmap — Capability Audit → Build Order

**Date:** 2026-10-05 · **Method:** capability-by-capability validation against the codebase (Prisma schema, server actions, UI routes, lib engines), with the pure engine test suites executed. Nothing here is marked available on the strength of a plan document or a marketing line.

**Relationship to the other plans.** This extends `MODULE_GAP_PLAN.md` (same date) at feature granularity and reuses its phase numbering and migration letters (A/B/C). Where a model is named in `EXPORT_OS_MASTER_PLAN.md`, that spec wins. `ROADMAP.md` remains the single strategic roadmap; this file is the gap ledger and build order underneath it.

**Scope note.** The audit request named the product "EximCopilot". No such string exists in this repository — the product audited is **Zimplifyed.ai**. If EximCopilot is a separate codebase, none of this applies to it.

**Status legend:** 🟢 available (fully functional) · 🟡 partial (works, important capability missing) · 🔴 missing (no meaningful implementation) · ⚪ unclear

## Build status — MVP items M1–M12

Built 2026-10-05, uncommitted. **Schema changes are additive and NOT yet pushed to the database** — see "Before this ships" below. Every item has pure, unit-tested logic (`npm test`: all suites pass); none has been exercised against a live database or browser.

| # | Item | State | Where |
|---|---|---|---|
| M1 | Order line items | Built | `OrderLineItem`, `src/lib/order-lines.ts`, `OrderLinesPanel`, doc engine reads order lines (falls back to quote lines), `scripts/backfill-order-lines.ts` |
| M2 | Carton packing → packing list | Built | `PackingEntry`, `src/lib/packing.ts`, `PackingPanel`, carton table in HTML + PDF, rules `pl_gross_ge_net` / `pl_packed_qty_matches_goods`. PDF byte-valid; not visually inspected |
| M3 | LC structured terms + deadline alerts | Built | `LetterOfCredit` fields + `LcStatus`, `src/lib/lc-deadlines.ts`, `scripts/lc-deadline-sweep.ts` + workflow, brief integration, terms form |
| M4 | FX rates + base-currency totals | Built | `FxSnapshot`, `src/lib/fx.ts`, `/dashboard/settings/fx`, converted cash-flow forecast. Manual rates only — no live feed |
| M5 | Accepted freight → cost sheet | Built | `src/lib/freight-allocation.ts`, "Use accepted freight quote" in the cost-sheet panel (review-then-save, no hidden writes) |
| M6 | Document upload everywhere | Built | Buyers, vendors, shipments, invoices, compliance items; ownership check added to `uploadDocument` |
| M7 | Report pack v1 | Built | `/dashboard/analytics` — revenue, ageing, pipeline, quoted margin by buyer/country/product, milestone on-time |
| M8 | Credit-limit warning | Built | `src/lib/credit-exposure.ts`, banner on the quote page (warn-only) |
| M9 | Purchase order from awarded RFQ | Built | `PurchaseOrder`, `/dashboard/purchase-orders`, printable detail, draft editing, status machine |
| M10 | Credit vs debit note | Built | `InvoiceNoteKind`, `src/lib/invoice-notes.ts` (one signed-amount rule), credit notes reduce the original's balance |
| M11 | Compliance sweep → action queue | **Already wired**; sweeps were crashing | The sweep already called `enqueueAction`. The real defect: `compliance`, `receivables` and `shipment-delay` sweeps ran under plain `tsx` and died on `import 'server-only'`. Fixed with `--conditions=react-server` |
| M12 | IMAP inbox provider | Built, **not tested against a real mailbox** | `src/lib/inbox/imap.ts` + `imap-safety.ts` (SSRF guard), credential form in the inbox. New deps: `imapflow`, `postal-mime` |

### Before this ships

1. **Push the schema.** All additions are additive (`npx tsx scripts/check-schema-safety.ts` passes). Use the direct URL per the project's `db push` note, then `npm run backfill:order-lines -- --dry-run`.
2. **CISO review of M12** before enabling it for tenants: it dials a tenant-supplied host. Mitigations are in place (public DNS names only, TLS-only on 993, every resolved address must be public, dials the validated IP, read-only mailbox, 5 MB / 50-message caps) but the live adapter has never connected to a server.
3. **Behaviour changes to be aware of**: order P&L now nets credit notes into revenue (it used to drop notes entirely); GST prep now *adds* typed debit notes (it used to subtract every note); legacy untyped notes still count as credits.
4. **Known limits**: the order page shows the Packing panel only for orders that have saved line items (legacy orders get lines by saving them once or running the backfill); freight reaches the order P&L through the cost sheet, so it only counts under CFR/CIF/DAP/DDP (correct — under FOB the seller doesn't bear it); report margins are *quoted* margins from quote-line costs, and lines with no cost are excluded and counted.

## Build status — V2 and V3

Built 2026-10-05/06, uncommitted, **schema not pushed** (a second additive batch on top of M1–M12). Same standard as the MVP: pure, unit-tested logic for every engine; none of it has run against a live database or a browser.

### Built

| Area | What exists | Where |
|---|---|---|
| Costing | Commission, bank-charge and documentation cost heads placed at the right Incoterm; per-buyer margin floor/target; break-even and price-for-target-margin; cost-head suggestions from the tenant's own past sheets (median, range, sample count, confidence — not an LLM guess) | `landed-cost.ts`, `pricing-buildup.ts`, `cost-history.ts`, buyer page, cost-sheet panel |
| Packing & containers | Container capacity (20GP/40GP/40HC) and pallet fit, cheapest container mix, LCL advice, honest *estimate* for mixed carton sizes; carton dimensions on products | `loadability.ts`, `LoadPlannerPanel`, product page |
| LC | Document checklist, presentation pre-check (late shipment, closed window, amount/currency, missing documents), AI *proposal* of structured terms from LC text (reviewed before saving) | `lc-presentation.ts`, `lc-extract.ts`, LC panel |
| Catalogue | Product variants, product files, dimensions/weights, reorder level | product page |
| Supply side | Forwarder master + normalised freight comparison (all-in and per CBM/kg, expired/unrated quotes never ranked); goods receipts with partial deliveries; supplier scorecard (on-time, rejection, price trend; withheld below 3 orders); vendor portal (no-login, hashed single-vendor tokens, rate-limited); inventory-lite with low-stock | `/dashboard/forwarders`, PO page, vendor page, `/vendor-quote/[token]`, `/dashboard/stock` |
| Money | Supplier bills and payments (payables ageing); bank-statement CSV import with *suggested* matches (nothing settled until confirmed); company P&L; FX exposure; export realisation clock; margin-leak decomposition per order; accountant CSV and Tally XML export | `/dashboard/payables`, `/dashboard/bank`, `/dashboard/analytics`, `/api/export/accounting` |
| Compliance | Per-shipment certificates (COO, phyto, fumigation, inspection) linked to orders; RoDTEP *estimate* with provenance and caveats | compliance page, incentive form |
| Comms | Multi-step follow-up cadence (day 3 / 7 / 90, per-tenant override) — still L1, every draft goes to the approval queue; WhatsApp free-form replies gated on the 24-hour window; forwarder emails read into shipment fields with ISO 6346 container check digits | `quote-followup-sweep.ts`, `whatsapp-window.ts`, inbox panel |
| V3 | Import landed cost (customs valuation → duties → creditable IGST kept out of cost → per-line true cost); production runs with stages and lateness; quality inspections with a simplified AQL screen and a gate that blocks shipping after a failed inspection | `/dashboard/imports`, `/dashboard/production` |

### Deliberately not built, and why

| Item | Why it is not here |
|---|---|
| Carrier / aggregator tracking APIs | Needs a paid third-party contract and credentials. Tracking stays manual, but forwarder emails can now be read into milestones. |
| Banking / Account Aggregator integration | Needs regulated-entity onboarding and bank credentials. CSV import covers the manual path. |
| GST filing via GSP | A licensed act — needs the CCO/legal sign-off already listed as a blocker. The product prepares and routes; it does not file. |
| Destination-country compliance packs | `registry.ts` is explicit: not to be added from memory, only with a local advisor's sign-off per country. |
| Cross-tenant benchmarks | Needs a consent, anonymisation and minimum-cohort design reviewed by the CISO before any tenant data is pooled. |
| Named department agents (L3) and automatic sending (L2) | Autonomy is earned per flow by approve-without-edit rates in production, and signed off by the CAIO; there is no such history yet. New flows ship at L1. |
| Trade-finance / insurance referral marketplace | Partner agreements, not code. |
| Public API | Needs an auth/key/scoping design reviewed by the CISO. The accountant export covers the immediate need. |
| Schema-aware analytics copilot | A model generating queries over tenant data needs its own isolation proof; the existing role-scoped tool-use copilot stays. |

### Caveats worth knowing

- **AI flows are unverified.** `lc_extract` and `shipping_doc_extract` have prompts and eval cases but have **not been run** against a model; no baseline exists. They only ever propose — a person reviews before anything saves.
- **Tally XML** has not been imported into a real Tally company; ledger names must already exist there.
- **FEMA realisation period** (default 9 months) is a parameter and advisory; confirm with the AD bank.
- **Customs rates** (BCD, SWS, IGST) and the 1% notional landing charge are *inputs*, never hard-coded; verify with a CHA.
- **QC verdict** is a simplified defect-percentage-versus-AQL screen, explicitly **not** ISO 2859-1.
- Statutory-adjacent surfaces (realisation clock, RoDTEP estimate, import costing) should pass the CCO before being marketed.

---

## 0. Scoreboard

| Module | 🟢 | 🟡 | 🔴 | Verdict |
|---|---|---|---|---|
| 1. Sales & CRM | 6 | 7 | 0 | Solid spine, thin edges |
| 2. Product & catalog | 4 | 3 | 3 | Flat catalogue — no variants |
| 3. Procurement | 2 | 2 | 5 | Dead-ends at RFQ award |
| 4. Inventory & warehouse | 0 | 0 | 14 | Absent by decision |
| 5. Production | 0 | 1 | 10 | Absent; persona unsupported |
| 6. Sales order mgmt | 2 | 6 | 2 | Order header without line items |
| 7. Export costing & pricing | 11 | 6 | 2 | **Strongest module** |
| 8. Import / landed cost | 0 | 8 | 5 | Largest structural gap |
| 9. Export documentation | 3 | 7 | 7 | **Standout capability** |
| 10. Logistics & shipping | 12 | 5 | 1 | New, broad, manual |
| 11. Container & packing opt. | 0 | 2 | 12 | Absent — forces Excel |
| 12. Customs & compliance | 5 | 5 | 4 | Good India depth, no restrictions data |
| 13. Letter of credit | 0 | 4 | 7 | Widest claim-vs-code gap |
| 14. Finance & accounting | 5 | 8 | 6 | AR yes, AP no, GL never |
| 15. Export insurance | 0 | 1 | 5 | Absent |
| 16. Document management | 2 | 5 | 5 | Model exists, UI doesn't |
| 17. Analytics & reporting | 1 | 5 | 12 | **Weakest module** |
| 18. AI capabilities | 8 | 6 | 7 | Genuine AI, deliberately constrained |

---

## 1. Capability ledger

### 1.1 Sales & CRM

| Capability | Status | Evidence | Limitation | Priority |
|---|---|---|---|---|
| Lead management | 🟢 | `Lead` (8 stages, quality, SLA), `src/lib/lead-sla.ts`, `/dashboard/leads` | — | — |
| Customer/company management | 🟢 | `Buyer` (country, address, taxIds, terms, creditLimit) + buyer-360 | — | — |
| Contact management | 🟢 | `Contact` (email/phone/whatsapp/role/isPrimary) | Hangs off `Buyer` only — none for vendors or leads | Med |
| Sales pipeline | 🟡 | `LeadStage` enum, 8 fixed stages | Not configurable; `kanban:*` permissions exist with no route; no weighted value/forecast | Med |
| Activities / tasks | 🟢 | `Activity` + `Task`, `/dashboard/tasks` | — | — |
| Follow-ups | 🟢 | `nextFollowUpAt`, `scripts/quote-followup-sweep.ts`, `buyer_followup` AI → action queue | Drafts only (L1); no cadences | Med |
| RFQ management (inbound buyer) | 🟡 | `rfq_extraction` AI, paste-enquiry box | No buyer-RFQ entity — `/dashboard/rfqs` is **vendor** RFQ; inbound becomes a lead, not a tracked RFQ with lines/deadline | **High** |
| Quotation management | 🟢 | `Quote` + lines + `parentQuoteId` version chain + `shareToken` + margin-floor soft block | — | — |
| Multi-currency quotations | 🟡 | `Quote.currency`, `PriceList.currency` | Currency is a **label only** — no FX rate anywhere in the repo | **High** |
| Customer communication | 🟡 | `InboxMessage`, `Activity`, inbox workbench | Send only as action-queue-approved reply-in-thread (by design) | Med |
| Email integration | 🟡 | `src/lib/inbox/gmail.ts` live OAuth sync + `gmail-send.ts` | `imap` / `email` are `stubProvider` throwing `ProviderNotConfigured` | **High** |
| WhatsApp integration | 🟡 | Inbound webhook + `src/lib/whatsapp/send.ts` with DPDP consent gate | Template sends only; no session messages; pull provider stubbed | **High** |

### 1.2 Product & catalog

| Capability | Status | Evidence | Limitation | Priority |
|---|---|---|---|---|
| Product master | 🟢 | `Product` (sku, name, uom, category, active) | — | — |
| SKU management | 🟢 | `@@unique([tenantId, sku])` | — | — |
| Product variants | 🔴 | No variant model | Size/colour/grade must become separate SKUs | **High** |
| Product specifications | 🟡 | `Product.specs Json?` | Free-form, no schema, no UI, not printed on docs | Med |
| Product images | 🔴 | `Product.photos String[]` in schema | **Zero UI references** — the field is dead | Med |
| HS code mapping | 🟢 | `Product.hsCodeId → HsCode`, enforced by `in_hs_code_8_digit` rule | — | — |
| Country-specific product info | 🔴 | None | No per-destination HS, labelling, or cert requirements | **High** |
| Price lists | 🟢 | `PriceList` + `PriceListItem` (incoterm, MOQ, validity) | — | — |
| Customer-specific pricing | 🟢 | `PriceList.buyerId` | — | — |
| Supplier-specific pricing | 🟡 | `VendorRate` + `VendorRateTier` (per piece/kg/metre, MOQ, lead time) | Keyed on free-text `sku` **string**, not a `productId` FK — rates detach from the catalogue | **High** |

### 1.3 Procurement

| Capability | Status | Evidence | Limitation | Priority |
|---|---|---|---|---|
| Supplier management | 🟡 | `Vendor` (name, contact, email, phone, bankDetails) | No address, GSTIN, category, contacts, documents | Med |
| Supplier RFQ | 🟢 | `VendorRfq` / `VendorRfqInvite` / `VendorRfqQuote` + award | No vendor portal — quotes recorded by staff | Med |
| Supplier quotation comparison | 🟢 | `computeVendorQuoteLandedCost` normalises quotes to a common Incoterm basis; test passes | Add-on costs hand-entered | — |
| Purchase orders | 🔴 | No PO model | Awarded vendor receives no document | **High** |
| Purchase approval workflow | 🔴 | No `approvalRequired` anywhere | — | Low |
| Goods receipt / GRN | 🔴 | None | — | Med |
| Supplier invoices | 🟡 | `Expense` OCR captures vendor bills (vendor, amount, GST head, ITC) | Expense record, not an AP document; no 3-way match | Med |
| Supplier payment tracking | 🔴 | `cash-flow-forecast.ts` explicitly excludes payables | No payables at all | **High** |
| Supplier performance tracking | 🔴 | `isPreferred`, `leadTimeDays` stored only | No on-time %, rejection rate, price trend | Med |

### 1.4 Inventory & warehouse — 14/14 🔴

No models, actions, or routes. Grep for `inventory`, `warehouse`, `stock`, `batch`, `serial`, `barcode`, `pallet` returns only an unused `samples:inventory` permission string.

Inventory mgmt · multiple warehouses · storage locations · stock transfers · stock reservation · batch/lot · serial numbers · barcode/QR · stock adjustment · inventory valuation · low-stock alerts · warehouse mgmt · packing/carton mgmt · pallet mgmt — all 🔴.

`ROADMAP.md` §2.5: "Full WMS is out of scope permanently"; inventory-lite is Planned → Phase C. **Priority: inventory-lite = Med (manufacturer-exporters); full WMS = do not build.**

### 1.5 Production / manufacturing

| Capability | Status | Evidence | Priority |
|---|---|---|---|
| BOM · raw-material planning · work orders · production planning · finished goods · production costing · wastage · quality control · production stages · subcontract mfg | 🔴 (10) | No models | Med (QC) / Low (rest) |
| Production tracking | 🟡 | `OrderStatus.in_production` — a single flag | **High** |

The manufacturer-exporter persona is named in `ROADMAP.md` with **no manufacturing module whatsoever**.

### 1.6 Sales order management

| Capability | Status | Evidence | Limitation | Priority |
|---|---|---|---|---|
| Sales orders | 🟡 | `Order` + quote conversion | **`Order.product String?` / `quantity Float?` — no order line items.** Multi-line exists only on the attached `Quote` | **High** |
| Order status tracking | 🟢 | 6-state `OrderStatus`, audit log, buyer track link | — | — |
| Partial shipments | 🟡 | `ShipmentOrder` M2M allows N shipments per order | No per-shipment quantity allocation; no shipped-vs-ordered balance | **High** |
| Backorders | 🔴 | None | — | Low |
| Order approval | 🔴 | None | Margin-floor override on quotes is the only gate | Low |
| Customer-specific terms | 🟡 | `Buyer.paymentTermsDefault`, `TermsClauseSet`/`TermsClause` (locale-aware) | Clause sets exist in schema; not applied to orders or printed docs | Med |
| Payment terms | 🟡 | Buyer default string, `Invoice.dueDate` | No terms engine (30% advance / 70% against BL); no milestone receivables | **High** |
| Delivery terms | 🟡 | Only in `rfq-extraction` AI output | Not a stored order field | Med |
| Incoterms | 🟢 | 7 Incoterms drive cost-head inclusion + doc headers; `incoterm_uniform` cross-doc rule | — | — |
| Order profitability | 🟢 | `src/lib/order-pnl.ts` — quoted vs actual, incentives, booked expenses; test passes | FX variance out of scope | — |

### 1.7 Export costing & pricing — strongest module

| Capability | Status | Evidence | Limitation |
|---|---|---|---|
| EXW / FCA / FOB / CFR / CIF / DAP / DDP costing | 🟢 | `src/lib/landed-cost.ts` — each Incoterm a superset of the prior; non-seller-borne heads excluded. Test passes | — |
| Product cost (material + conversion) | 🟢 | `CostCategory.material`, `conversion` | — |
| Packaging cost | 🟢 | `packing` | — |
| Inland transportation | 🟢 | `inland_freight` | — |
| Port charges | 🟢 | `port` | — |
| CHA / customs charges | 🟢 | `cha` | — |
| Freight | 🟢 | `freight` | Not auto-filled from `FreightQuote` |
| Insurance | 🟢 | `insurance` | No CIF 110% auto-calc |
| Commission | 🟡 | No dedicated head; `other` + free-text `label` | No agent-commission model or per-buyer rate |
| Banking charges | 🟡 | `finance_cost` | Generic; no bank-charge schedule |
| Documentation charges | 🟡 | Folded into `cha` ("CHA / documentation") | Not separable |
| Miscellaneous export expenses | 🟢 | `other` | — |
| FX conversion | 🔴 | **No `exchangeRate` / `fxRate` / rate provider in the repo** | Cost sheets and prices are single-currency |
| Target margin | 🟡 | `MARGIN_FLOOR_PCT = 10` (admin override), `DEFAULT_MARGIN_PCT = 20` | Global constants — not per customer/product/market |
| Gross margin | 🟢 | `marginPctFromCostPrice`, `landedMarginPct` | — |
| Net margin | 🟡 | `computeOrderPnl` actual margin after expenses + incentives | No overhead allocation; order-level only |
| Break-even price | 🟡 | `landedCostPerUnit` is displayed (break-even at 0%) | Not labelled as break-even; no min-price guard at quote time |
| Selling-price calculator | 🟢 | `computeSellPrice`, cost-sheet panel, public landed-cost tool | — |
| Customer-specific margin | 🔴 | Margin is per quote line | No buyer-level margin policy or floor |

**Automatic or manual?** The **calculation is automatic and correct** (Incoterm filtering, RoDTEP credit, margin-on-price, vendor normalisation — all unit-tested). The **inputs are 100% manual**: no freight-rate table, port tariff, duty table, FX feed, or auto-pull from awarded vendor rates / accepted freight quotes. An exporter still types 8–11 numbers per cost sheet.

### 1.8 Import / landed cost — largest structural gap

| Capability | Status | Evidence | Priority |
|---|---|---|---|
| Import purchase order | 🔴 | No PO model; no import direction on any entity | **High** |
| Import shipment | 🔴 | `Shipment` carries `shippingBillNumber`/`blNumber` — export semantics; no BOE, no import flag | **High** |
| Customs duty | 🟡 | `HsCode.dutyRatePct` is an **AI estimate**; `CostCategory.duties` exists | **High** |
| IGST (on imports) | 🔴 | `src/packs/in/gst.ts` = outward zero-rated + LUT; `gst-prep.ts` = ITC on expenses. No import IGST / assessable value | **High** |
| Freight · insurance · port · CHA · transportation · other import expenses | 🟡 (6) | Cost heads exist but only inside a **seller-side** `CostSheet` on a `Quote` | Med |
| Warehousing | 🔴 | None | Low |
| Landed-cost calculation (import) | 🟡 | Engine reusable, but no import workflow and no assessable value → BCD/SWS/cess → IGST chain | **High** |
| Allocation of landed cost to inventory | 🔴 | No inventory to allocate to | **High** |
| True product cost after import | 🔴 | — | **High** |

The Importer persona named in `docs/ROADMAP_2026_2029.md` has **no implementation**.

### 1.9 Export documentation — standout capability

| Capability | Status | Evidence | Limitation |
|---|---|---|---|
| Proforma Invoice | 🟢 | `DOC_SERIES.PI`, bank block, Rule-46 endorsement | — |
| Commercial Invoice | 🟢 | `DOC_SERIES.CI`, amount in words, place of supply | — |
| Packing List | 🟡 | `PackingBody = { lines, totalQuantity }` | **Quantities only** — no cartons, net/gross weight, dimensions, CBM, or marks & numbers. Not usable by a CHA |
| Certificate of Origin | 🟡 | `OriginBody` + declaration + country of origin | Self-declaration only; no chamber/DGFT eCoO, no FTA preferential origin |
| Purchase Order | 🔴 | No PO document | — |
| Sales Order | 🔴 | No SO document | — |
| Shipping Instruction | 🔴 | None | — |
| Bill of Lading | 🟡 | `Shipment.blNumber` / `blDate` | Metadata only; no document or draft-BL generation |
| Air Waybill | 🟡 | Same `blNumber` field reused; `ShipmentMode.air` exists | No AWB-specific fields or document |
| Insurance Certificate | 🔴 | None | — |
| Inspection Certificate | 🔴 | None | — |
| Fumigation Certificate | 🔴 | None | — |
| Phytosanitary Certificate | 🔴 | None | — |
| Declaration documents | 🟡 | Rule-46 endorsement (LUT vs IGST-paid), place-of-supply 96, COO declaration | No GSP/Form-A, SDF, or annexures |
| Export invoice | 🟢 | = Commercial Invoice | — |
| Country/product-specific docs | 🟡 | `CountryPack`/`IndustryPack` registry — `in` + `generic`/`textiles` only | UAE pack blocked on advisor sign-off |
| **One order → many docs, no re-entry** | 🟢 | `DocSet`: one immutable `DocContext` → 4 docs, 10 deterministic cross-doc rules, AI consistency pass, FY-aware numbering, versioning, cancel-with-reason, tokenised CHA/buyer link, PDF via `@react-pdf/renderer`. **Golden harness: 22 rule fixtures + 29 assertions pass** | 4 doc types only |

### 1.10 Logistics & shipping

| Capability | Status | Evidence | Limitation |
|---|---|---|---|
| Shipment management | 🟢 | `Shipment` + `src/actions/shipments.ts` (10 actions) + `/dashboard/shipments/[id]` — commit `ac6dae4` | — |
| FCL / LCL / air / sea / courier | 🟢 | `ShipmentMode = sea_fcl \| sea_lcl \| air \| road \| courier` | Mode is a label — no mode-specific logic or rate basis |
| Freight forwarder management | 🟡 | `forwarderName` free text | No forwarder master, contacts, or scorecard |
| Freight quotation comparison | 🟡 | `FreightQuote` (amount, transitDays, validTo, status) + accept/reject | List only; no per-CBM/per-kg normalisation, no all-in compare, no RFQ-to-forwarders |
| Container management | 🟢 | `Container` (number, type, seal, grossWeightKg, cbm) | All hand-entered |
| Container no. · seal no. · vessel info · POL · POD · ETD · ETA | 🟢 (7) | `containerNumber`, `sealNumber`, `vesselOrFlight`, `originPort`, `destPort`, `etd`, `eta` | — |
| Shipment milestones | 🟢 | 6 types (gate_in → delivered), planned vs actual, buyer-visible, `scripts/shipment-delay-sweep.ts` with week-bucket dedupe | — |
| Shipment tracking | 🟡 | Manual milestone entry + buyer track link | No carrier/aggregator API |
| BL / AWB tracking | 🟡 | Numbers stored | No status polling |
| Freight cost | 🟡 | `FreightQuote.amount` | **Does not flow into the cost sheet or order P&L** |
| Shipment profitability | 🔴 | P&L is order-level | No per-shipment or per-container margin |

### 1.11 Container & packing optimisation — almost entirely absent

| Capability | Status | Evidence |
|---|---|---|
| Carton dimensions | 🔴 | No field |
| Product dimensions | 🔴 | Only unstructured `Product.specs Json` |
| CBM calculation | 🟡 | `Container.cbm` is a **manually typed number** — nothing computes it |
| Gross / net weight | 🟡 | `Container.grossWeightKg` manual; **no net weight anywhere**; neither reaches the packing list |
| Pallet dimensions · pallet utilisation · container capacity · 20FT/40FT/40HC calc · container loading optimisation · carton optimisation · pallet loading visualisation · suggested carton config · suggested container config | 🔴 (9) | No `pallet` hits; `Container.type` is a free-text label with no capacity data behind it |

**Priority: High.** This is the gap that forces exporters back into Excel, and the natural source of the packing list the doc engine cannot currently produce.

### 1.12 Customs & trade compliance

| Capability | Status | Evidence | Limitation |
|---|---|---|---|
| HS code database | 🔴 | `HsCode` is a per-tenant **cache of AI results**, `@@unique([tenantId, description])` | No ITC-HS master, no chapter/heading tree, no code browse |
| HS code recommendations | 🟢 | `src/lib/ai/hs-classification.ts` — 6–8 digit code + rationale, cached, audited; public HS finder | AI estimate, honestly labelled as needing CHA verification |
| Import duty | 🟡 | `dutyRatePct` from the same AI call | **An LLM-estimated duty rate, not a tariff lookup** |
| Export restrictions | 🔴 | None | No SCOMET, no prohibited/restricted ITC-HS flags |
| Country restrictions | 🔴 | None | — |
| Product restrictions | 🔴 | None | — |
| IEC management | 🟢 | `ComplianceCategory.iec`, `tenant.iecNumber`, `in_iec_format` rule | — |
| GST information | 🟢 | GSTIN + `in_gstin_format` rule + `src/lib/gst-prep.ts` pack for the CA | Prep only — never files |
| LUT | 🟢 | `lutNumber`, `lutValidTo`, endorsement selection, `in_lut_validity` rule | — |
| RCMC | 🟢 | `ComplianceCategory.rcmc` + expiry sweep | — |
| Certificate of Origin | 🟡 | See §1.9 | — |
| Customs documentation | 🟡 | `shippingBillNumber`/`Date`/`Port` stored | No shipping bill generation, no ICEGATE, no annexures |
| Sanctions screening | 🟢 | `src/lib/screening.ts` — live `api.trade.gov` CSL, fuzzy match, **deliberately no LLM**, manual-attestation fallback | US CSL only — no EU/UN/UK/HMT |
| Restricted-party screening | 🟡 | Same `ScreeningCheck` model | Point-in-time; no re-screening; not a gate before shipping |
| Trade compliance alerts | 🟡 | `scripts/compliance-expiry-sweep.ts` with re-alert windowing, wired to the action queue (`renew_compliance`) + doc rule findings | Expiry only; no regulatory-change monitoring. (Sweep scripts previously crashed on `server-only`; fixed.) |

### 1.13 Letter of credit

| Capability | Status | Evidence | Limitation |
|---|---|---|---|
| LC management | 🟡 | `LetterOfCredit` (lcNumber, issuingBank, rawText, AI review) + panel + public LC checker | A text blob plus an AI opinion — not a managed instrument |
| LC amount | 🔴 | **No field** | Cannot check utilisation or over/under-drawing |
| LC expiry | 🔴 | **No field** | No expiry alert possible |
| Latest shipment date | 🔴 | **No field** | The most common discrepancy cause is untracked |
| Required documents | 🔴 | No structured list | — |
| LC terms extraction | 🟡 | `src/lib/ai/lc-advisor.ts` returns `{workable, summary, issues[]}` | Flags issues; **does not extract a structured term set** |
| Document checklist | 🔴 | None | — |
| LC discrepancy detection | 🟡 | AI advisory against free-text order context | Pre-issuance advice, not presentation-time checking |
| LC document matching | 🔴 | `src/lib/ai/document-consistency.ts` compares **documents to each other only** — the LC is never an input | `ROADMAP.md` claims "doc-vs-LC consistency AI" as Built; the code does doc-vs-doc |
| LC status | 🔴 | No status field | — |
| Bank communication | 🔴 | None | — |

**Priority: High.** One schema change plus one prompt change away from a genuine differentiator, and currently the widest gap between claim and code.

### 1.14 Finance & accounting

| Capability | Status | Evidence | Limitation |
|---|---|---|---|
| Commercial invoicing | 🟢 | `Invoice` + `InvoiceLineItem` + `InvoiceTemplate` + numbering | — |
| Credit notes | 🟡 | A single `isCreditOrDebitNote Boolean` | **Credit and debit notes are indistinguishable**; no link to original; no reason code |
| Debit notes | 🟡 | Same flag | Same |
| Accounts receivable | 🟢 | `balanceDue`, overdue detection, `scripts/receivables-chase-sweep.ts` | — |
| Accounts payable | 🔴 | None | — |
| Payment tracking | 🟡 | `BankRealization` — FIRC/e-BRC credit advices matched in full or part | Export remittance only; no generic receipt/payment ledger or payment modes |
| Outstanding invoices | 🟢 | Dashboard + brief + cash flow | — |
| Overdue invoices | 🟢 | Brief urgent item + chase sweep | — |
| Customer credit limits | 🔴 | `Buyer.creditLimit` referenced **only** in `src/actions/buyers.ts` | Stored and displayed; **never enforced or warned** |
| Supplier payments | 🔴 | None | — |
| General ledger | 🔴 | `ROADMAP.md` §2.8: out of scope permanently ("keep Tally, we sync to it") | Deliberate — correct call |
| P&L | 🟡 | Order-level only | No company-level P&L |
| Balance sheet | 🔴 | None | Deliberate |
| Cash flow | 🟡 | `src/lib/cash-flow-forecast.ts` — 6 weekly receivables buckets + incentive pipeline | No payables; mixes currencies with only a warning flag |
| Bank reconciliation | 🟡 | FIRC/e-BRC → invoice matching | Manual entry; no statement import or auto-match |
| Multi-currency accounting | 🔴 | No FX rate model | — |
| FX gain / loss | 🔴 | `order-pnl.ts`: "no exchange-rate booking model yet" | — |
| Tax management | 🟡 | GST prep pack (ITC by head, zero-rated turnover by currency) + Rule-46 endorsements | Prepares for the CA; no liability computation or filing |
| Expense management | 🟢 | `src/ai/pipelines/expense.ts` — vision OCR → GST head + ITC → confidence gate → auto-post or review, order-attributed | — |

### 1.15 Export insurance

| Capability | Status | Evidence |
|---|---|---|
| Shipment insurance | 🔴 | `CostCategory.insurance` is a cost line — no insurance entity |
| Policy management · coverage tracking · claims · claim status | 🔴 (4) | No model, action, or route |
| Insurance premium | 🟡 | Enterable as a per-unit cost line; no rate basis or CIF 110% calc |

**Priority: Low–Med.** Most SME exporters use a forwarder certificate or an annual open policy; a referral/partner flow beats building this.

### 1.16 Document management

| Capability | Status | Evidence | Limitation |
|---|---|---|---|
| Central document repository | 🟡 | `Document` polymorphic model (`collection` + `documentId`), S3/R2 storage | No repository route; no cross-entity search or filter |
| Customer documents | 🔴 | — | `DocumentPanel` is mounted **only** on `/dashboard/orders/[id]` |
| Supplier documents | 🔴 | — | No upload UI on vendors |
| Shipment documents | 🔴 | — | No upload UI on shipments |
| Invoice documents | 🔴 | — | No upload UI on invoices |
| Certificates | 🟡 | `ComplianceItem` holds number/issuer/expiry | No file attachment UI on compliance items |
| Contracts | 🔴 | None | — |
| Version control | 🟡 | **Generated** docs: `DocSet.version`, supersede, cancel-with-reason. **Uploaded** files: none | Two different worlds |
| Document expiry alerts | 🟡 | Compliance-item sweep with `lastAlertedAt` windowing | Compliance items only; not uploads or buyer certs |
| Document sharing | 🟢 | Tokenised `/doc-set/[token]`, `/quote/[token]`, `/track/[token]` | — |
| Document permissions | 🟡 | Role permissions + 5-minute presigned URLs | No per-document ACL; share tokens are unauthenticated bearer links |

### 1.17 Analytics & reporting — weakest module

**There is no tenant-facing analytics or reports route.** Reporting surfaces today: dashboard stat cards (3 counts), `/dashboard/brief`, `/dashboard/cash-flow`, `/dashboard/gst-prep`, the order P&L panel, and a **platform-admin-only** signup funnel.

| Capability | Status | Evidence |
|---|---|---|
| Sales | 🟡 | Lead/order counts; no funnel, trend, or win-rate |
| Revenue | 🔴 | No revenue report — only per-invoice totals |
| Gross margin | 🟡 | Per quote (`overallMarginPct`) / per order; no portfolio view |
| Net margin | 🟡 | Per order only |
| Product profitability | 🔴 | — |
| Customer profitability | 🔴 | — |
| Country profitability | 🔴 | — |
| Supplier performance | 🔴 | — |
| Inventory · stock ageing | 🔴 | No inventory |
| Outstanding receivables | 🟢 | Brief + cash flow + invoice list |
| Payables | 🔴 | — |
| Shipment performance | 🔴 | Delay sweep alerts, but no on-time report |
| Logistics costs | 🔴 | — |
| Export performance | 🔴 | — |
| Import performance | 🔴 | No import module |
| Cash flow | 🟡 | 6-week receivables only |
| FX exposure | 🔴 | — |

**Priority: High.** `ROADMAP.md` has "Analytics v1" in Phase C — too late. Margin and buyer-concentration reporting is the proof the costing engine paid off.

### 1.18 AI capabilities — genuine AI, not a chatbot veneer

Platform: `src/ai/router.ts` has tier-based routing (`extract`/`draft`/`reason`), Anthropic→Gemini fallback, per-call cost accounting, retry on 429/5xx, timeouts, versioned prompts from disk, `AiInteraction` audit rows (tokens/cost/latency), `AiFeedback` (accepted/edited/rejected), `MeterEvent` billing, budget enforcement, an eval harness (`npm run eval:ai`), and an explicit human-approval gate (`approvedByUserId`).

Ten production flows: `enquiry_extract`, `rfq_extraction`, `expense_extract`, `hs_classification`, `inbox_classify`, `inbox_reply`, `buyer_followup`, `lc_advisor`, `document_consistency`, `copilot`.

| Capability | Status | Evidence | Limitation |
|---|---|---|---|
| AI business assistant | 🟢 | `src/lib/ai/copilot.ts` — multi-turn tool use; tools filtered by **role permission**, so a sales role is never offered `list_quote_margins` (structural isolation, not a prompt instruction) | 4 turns max |
| Natural-language queries | 🟡 | 6 retrieval tools: recent leads, recent quotes, quote margins, recent orders, overdue invoices, `search_trade_knowledge` (pgvector) | Hard-coded tools — cannot answer "margin by country last quarter" |
| AI quotation generation | 🟡 | `rfq_extraction` → draft lines; price-list prefill | No pricing intelligence or win probability |
| AI costing | 🔴 | Cost sheet fully manual | No AI estimation of freight/port/CHA/duty from route + HS + mode |
| AI document extraction | 🟢 | Vision pipeline, base64 image blocks in the router | — |
| AI invoice extraction | 🟡 | `expense_extract` pulls vendor/amount/date/GST head | Header-level only; no line items, no PO match |
| AI email analysis | 🟢 | `inbox_classify` → category + summary; Gmail history-API sync | — |
| AI email drafting | 🟢 | `inbox_reply` (RFC-2822 reply-in-thread) + `buyer_followup` | Action-queue gated (correct) |
| AI customer follow-up | 🟢 | `buyer-followup.ts` + followup sweep | L1 — human approves each |
| AI supplier comparison | 🔴 | Comparison is **deterministic** (the right choice) | No AI recommendation, risk flag, or price-trend read |
| AI product recommendations | 🔴 | None | — |
| AI HS-code assistance | 🟢 | Cached, audited, rationale-bearing | Duty/RoDTEP rates are AI guesses |
| AI compliance assistance | 🟡 | Deterministic doc rules (correct) + LC advisor | No AI on restrictions, licensing, destination rules |
| AI shipment analysis | 🔴 | Delay sweep is deterministic | No ETA risk prediction |
| AI financial analysis | 🔴 | Brief + cash flow deterministic | — |
| AI forecasting | 🔴 | None | — |
| AI anomaly detection | 🔴 | Only a confidence gate on expense OCR | — |
| AI-powered reports | 🔴 | None | — |
| AI workflow automation | 🟡 | 5 nightly sweeps, durable `Job` queue + worker, `ActionQueueItem` with dedupe keys and `editedOnApprove` | All L1 — nothing executes autonomously; L2 is Phase B |
| AI agent capabilities | 🟡 | Copilot tool-use loop; 9 `ActionKind` producers | Read-only tools; no goal-directed, memory-bearing agents |

**Verdict: genuine AI, deliberately constrained.** The L1-only posture, the "never use an LLM for sanctions screening" decision, and the deterministic rule engine sitting *in front of* the AI consistency pass are judgment, not missing capability.

---

## 2. What the platform already does well

1. **Document generation** — one `DocContext` snapshot → PI, CI, PL, COO with FY-aware per-tenant numbering, 10 deterministic cross-document rules, an AI consistency pass, immutable versioning, cancel-with-reason, PDF output, tokenised CHA/buyer links. Golden harness (22 fixtures + 29 assertions) passes.
2. **Incoterm-aware export costing** — the EXW→DDP superset chain correctly governs seller-borne heads, with RoDTEP credit-back and margin-on-price. Unit-tested.
3. **Vendor quote comparison on a common Incoterm basis** — real EXIM depth that generic ERPs get wrong.
4. **Order P&L** — quoted vs actual margin including incentive credits and OCR'd expenses. Tested.
5. **India statutory correctness** — Rule-46 endorsement selection (defaulting to the safer wording), place-of-supply 96, IEC/GSTIN/HS validation, LUT validity checks.
6. **Expense capture** — snap a receipt → vision extraction → GST head + ITC → confidence gate → auto-post or review.
7. **Sanctions screening** — live US CSL, fuzzy matching, no LLM, manual-attestation fallback rather than a fabricated "clear".
8. **AI platform engineering** — tiered routing, provider fallback, cost metering, versioned prompts, feedback capture, eval harness, budget caps, permission-scoped retrieval.
9. **Platform fundamentals** — multi-tenancy with a generated tenant-scope guard and live two-tenant isolation tests, permission matrix, audit log, domain events, credential vault, durable job queue, feature flags, Stripe + Razorpay billing with metering, DPDP consent records.
10. **Action Queue + founder brief** — one approval surface across SELL/MONEY/SHIP/COMPLY with idempotent dedupe, plus a deterministic daily digest.

---

## 3. EXIM-specific gaps — where "just use Zoho/Odoo/Tally" stops being an answer

| # | Capability | Held today |
|---|---|---|
| 1 | Incoterm-driven cost-head inclusion | 🟢 |
| 2 | Cross-document consistency enforcement before customs sees it | 🟢 |
| 3 | Statutory invoice endorsements + place of supply for zero-rated export | 🟢 |
| 4 | Vendor quote normalisation across differing Incoterms | 🟢 |
| 5 | **LC-to-document presentation matching** | 🔴 |
| 6 | **Container/carton loadability → auto-generated packing list** | 🔴 |
| 7 | **RoDTEP/drawback/EPCG entitlement tracked to claim and realisation** | 🟡 claims tracked; entitlement not computed from HS/shipping bill |
| 8 | **e-BRC/FIRC realisation against FEMA timelines** | 🟡 matching exists; no 9-month realisation clock |
| 9 | **Import duty + IGST landed cost allocated to true product cost** | 🔴 |
| 10 | **Destination-country compliance (labelling, certs, restricted HS, FTA origin)** | 🔴 |

---

## 4. AI opportunities ranked by (margin or error impact) ÷ (build cost)

Chatbot-only ideas excluded.

1. **AI cost-sheet pre-fill.** Given HS code + route + mode + volume, propose every cost head with a confidence and a citation (prior shipments, accepted freight quotes, awarded vendor rates). Highest-value flow in the product; does not exist. Turns an 11-field manual form into one-tap approval, and the grounding data (`CostSheet`, `FreightQuote`, `VendorRate`, `Expense`) is already in the database.
2. **LC presentation pre-check.** Extract LC terms into structured fields, then run the existing deterministic rule engine with the LC as a second input — the engine already supports multi-document input. Deterministic where possible, AI only for fuzzy clause reading. Prevents the most expensive error in export finance.
3. **Packing-list generation from a loadability solve.** Carton/pallet maths is deterministic bin-packing, not AI; AI's job is extracting dimensions from supplier spec sheets. Feeds the doc engine's weakest document and the container booking decision.
4. **Inbound shipping-document extraction.** Forwarder BL/AWB drafts, CHA shipping bills, buyer POs arrive as PDFs in the inbox. The vision pipeline exists; point it at these to auto-populate shipments, milestones, and orders. Removes "someone types every milestone" without a carrier-API deal.
5. **Margin-leak detection.** Quoted vs actual already computes; AI explains *why* it diverged (freight spike, FX, unbilled expense, scope creep) and flags the pattern across orders. Anomaly detection with a monetisable question behind it.
6. **Buyer-reply intent + negotiation read.** Classification exists; missing is "price-shopping / about to close / gone cold" scored against the cost-sheet floor, drafting a counter rather than a generic follow-up.
7. **Schema-aware analytics answering.** Replace the 6 fixed retrieval tools with a constrained query generator over a safe read model, so "gross margin by destination country this quarter" works. This makes the copilot load-bearing rather than a demo.

**Do not AI-ify:** sanctions screening, duty rates, GST filing, document numbering, cost arithmetic. The codebase already gets this right.

---

## 5. Ten differentiating capabilities

1. **LC-to-document presentation check** — structured LC terms + the existing rule engine, run before presentation.
2. **Container loadability → packing list → booking decision**, as one chain from product dimensions.
3. **AI cost-sheet pre-fill grounded in the tenant's own shipment history** — compounding moat: every quote gets faster and more accurate with use.
4. **Quoted-vs-realised margin ledger** including freight variance, FX, and incentive realisation. "Where did my margin go" is the question SME exporters cannot answer.
5. **Incentive entitlement → claim → realisation**, computed from HS code and shipping bill rather than hand-entered.
6. **FEMA realisation clock** on every export invoice (9-month rule), tied to e-BRC matching, surfaced in the brief.
7. **One-tap CHA/forwarder collaboration** — extend the working tokenised share link into a shared checklist with doc exchange and a status back-channel.
8. **Destination-country compliance packs** as a product line (labelling, certs, restricted HS, FTA origin), monetised per country.
9. **Import landed-cost mirror of the export costing engine** — same engine, opposite direction; opens the importer persona with largely existing machinery.
10. **Approve-the-day workflow** — the Action Queue + brief are the right shape; the differentiator is making it the only screen a solo exporter needs, with L2 autopilot on flows that earn it via the existing promotion metric.

---

## 6. Build order

Sequenced so the lead-to-cash loop stops leaking first, then depth. Phase numbers and migration letters follow `MODULE_GAP_PLAN.md`.

### MVP — must be true at launch

Everything already 🟢, plus these gap-closers. Each line is a work item, not a theme.

| # | Work item | Why it's MVP | Touches |
|---|---|---|---|
| M1 | **Order line items** — `OrderLineItem` (productId, description, qty, uom, unitPrice, hsCode); migrate `Order.product`/`quantity` by expand-then-contract | A single-product order blocks real multi-SKU exports and forces the doc engine to read the quote | `prisma/schema.prisma`, `src/actions/orders.ts`, `src/lib/doc-engine/context.ts`, `src/components/order-pnl-panel.tsx` |
| M2 | **Packing list with real packing data** — carton count, carton dims, net/gross weight, CBM, marks & numbers on `PackingBody`; a `PackingList` operation per `MODULE_GAP_PLAN` phase 2, pulled forward | The current packing list prints quantities only and is not usable by a CHA, which undercuts the product's strongest claim | `src/lib/doc-engine/models.ts`, `render.ts`, `pdf.tsx`, `rules.ts`, golden fixtures |
| M3 | **LC structured fields + deadline alerts** — add `amount`, `currency`, `expiryDate`, `latestShipmentDate`, `requiredDocuments Json`, `status` to `LetterOfCredit`; sweep into the brief and action queue | Fields + a sweep is a small build with large credibility; today no LC deadline alert is even possible | `prisma/schema.prisma`, `src/actions/letters-of-credit.ts`, `src/lib/founder-brief.ts`, new sweep script |
| M4 | **FX rate on quote / invoice / cost sheet** — `FxSnapshot` (per `MODULE_GAP_PLAN` phase 1) + manual entry with one rate source; base-currency totals | Without it multi-currency is cosmetic and no cross-currency report can be trusted | `prisma/schema.prisma`, `src/lib/landed-cost.ts`, `order-pnl.ts`, `cash-flow-forecast.ts` |
| M5 | **Accepted freight quote flows into cost sheet + order P&L** | Freight is the largest variable export cost and today it is entered twice and reconciled nowhere | `src/actions/shipments.ts`, `src/actions/cost-sheets.ts`, `src/lib/order-pnl.ts` |
| M6 | **Document upload on buyers, vendors, shipments, invoices, compliance items** | The `Document` model is already polymorphic; only the order page mounts `DocumentPanel` | `src/components/document-panel.tsx` mounts + `src/actions/documents.ts` collection whitelist |
| M7 | **Report pack v1** — `/dashboard/analytics`: revenue, gross margin by product/buyer/country, receivables ageing, order pipeline, shipment on-time | Analytics in Phase C is too late — reporting is the proof the costing engine paid off | new route + read-only queries over existing models |
| M8 | **Credit-limit warning at quote and order creation** | `Buyer.creditLimit` is stored, displayed, and never enforced | `src/actions/quotes.ts`, `src/actions/orders.ts` |
| M9 | **Purchase order document** from an awarded `VendorRfq` | Closes procurement's dead end; reuses the doc engine (new `DocType`) | `src/lib/doc-engine/models.ts`, `src/actions/vendor-rfqs.ts` |
| M10 | **Credit vs debit note split** — replace `isCreditOrDebitNote` with a typed enum + `originalInvoiceId` + reason | The two are currently indistinguishable, which breaks any receivables or GST reconciliation | `prisma/schema.prisma`, `src/actions/invoices.ts`, `src/lib/gst-prep.ts` |
| M11 | ~~Wire the compliance-expiry sweep to the action queue~~ **Already wired** — fix the sweep scripts' `server-only` crash instead | This audit first read the stale `ROADMAP.md` line and marked it unwired. The sweep calls `enqueueAction`; three sweeps could not start | `package.json` sweep scripts |
| M12 | **IMAP + generic-email inbox providers** | Two of five providers are `stubProvider`; Gmail-only excludes most Indian SME exporters | `src/lib/inbox/provider.ts` |

### V2 — after product-market fit

Grouped by the gap each one closes.

- **Costing intelligence:** AI cost-sheet pre-fill (grounded in prior shipments) · customer-specific margin policy · commission and bank-charge heads · break-even surfaced explicitly at quote time.
- **Packing & containers:** carton/pallet dimension master · CBM computation · 20FT/40FT/40HC capacity model · loadability solve → suggested carton and container configuration · loading visualisation.
- **LC:** term extraction into the structured fields from M3 · document checklist · presentation pre-check running the rule engine with the LC as a second input.
- **Catalogue:** `ProductVariant` + spec axes + pricing matrices (`MODULE_GAP_PLAN` phase 1 / Migration A) · product images (wire the dead `photos` field) · product dimensions · `VendorRate.productId` FK replacing the free-text SKU.
- **Supply side:** vendor portal (tokenised, no login) · forwarder master + normalised freight comparison · supplier scorecards · GRN · inventory-lite (stock in/out against orders).
- **Money:** AP + supplier payments · `Payment` + `PaymentAllocation` · company P&L · FX exposure view · bank statement import with AI reconciliation.
- **Export extras:** certificate registry (COO/phyto/fumigation/BIS/inspection) with expiry and order link · incentive entitlement computation from HS + shipping bill · FEMA realisation clock.
- **Comms & automation:** WhatsApp session messages · follow-up cadences promoted to L2 · inbound shipping-document extraction · margin-leak detection.

### V3 — advanced / premium

Import landed-cost module (BOE, assessable value → BCD/SWS/cess → IGST, allocation to inventory) · destination-country compliance packs (2–3 countries) · carrier/aggregator tracking APIs · CHA collaboration workspace · production + QC module for manufacturer-exporters · named department agents (L3) · schema-aware analytics copilot · banking / Account Aggregator integration · GST filing via GSP · cross-tenant benchmarks (freight rates, margins by HS chapter) · trade-finance and insurance partner referrals · public API + Tally sync.

### Deliberately not building

Full WMS · general ledger · payroll · balance sheet · an in-house ITC-HS tariff database (license or integrate instead) · free-compose email client · AI-generated duty rates presented as authoritative.

---

## 7. Five killer features for Indian exporters/importers

1. **"Your documents will clear customs."** One order, one tap, a complete consistent set with statutory endorsements, validated IEC/GSTIN/HS/LUT, versioned, shareable to the CHA by link. Already ~80% built — finish the packing list (M2) and this is the reason people buy.
2. **"Know your real FOB before you quote."** Incoterm-aware costing with AI pre-fill from the tenant's own history, a margin floor that blocks loss-making quotes, and a quoted-vs-realised ledger. Nothing in this segment gets the Incoterm logic right.
3. **"No LC discrepancy, no deducted payment."** Structured LC terms, deadline alerts in the daily brief, presentation pre-check against the generated set. A single discrepancy costs more than a year of subscription.
4. **"The container decides the quote."** Product/carton dimensions → CBM → 20FT/40FT/40HC fit → suggested loading → packing list and freight basis fall out of it. This is the spreadsheet every exporter maintains by hand.
5. **"Every rupee the government owes you, tracked to the bank."** RoDTEP/drawback entitlement computed from HS code and shipping bill, through claim status, to e-BRC/FIRC realisation with the FEMA clock. Found money, and no generic ERP goes near it.

---

## 8. Plan corrections found during the audit

These are places where an existing plan document does not match the code. Fix the docs before any of it reaches marketing.

| Document | Claim | Reality |
|---|---|---|
| `ROADMAP.md` §2.7 | "PDF rendering — HTML-only today" (Partial → B) | **Built.** `@react-pdf/renderer@^4.9.0` is a dependency and `src/lib/doc-engine/pdf.tsx` renders `DocModel → PDF` bytes |
| `ROADMAP.md` §2.7 | "LC advisor + doc-vs-LC consistency AI" listed as Built | **Doc-vs-doc only.** `src/lib/ai/document-consistency.ts` never receives the LC as an input |
| `ROADMAP.md` §2.6 | Logistics: "[Built] Shipment milestones, buyer tracking link" | Understated — `Shipment`, `Container`, `FreightQuote` and `/dashboard/shipments` shipped in commit `ac6dae4` |
| `docs/MODULE_GAP_PLAN.md` Status | Logistics missing "Shipment, containers, freight, shipping documents" | Same — phase 0 has landed; update the table |
| `docs/MODULE_GAP_PLAN.md` Status | Sales missing "Quote revisions, buyer accept link" | Both exist: `Quote.parentQuoteId` version chain and `/quote/[token]` accept link |
| `ROADMAP.md` §2.10 | "Analytics v1" in Phase C | Too late; promoted to MVP as M7 here |
| `src/lib/permissions.ts` | `samples:*` (5 permissions) and `kanban:*` (2) | Dead permissions — no models, actions, or routes. Remove or implement |
| `prisma/schema.prisma` | `Product.photos String[]` | Dead field — zero UI references |

---

## 9. Verification method

Engine suites executed during this audit, all passing:

```
npm run test:pricing        # margin-on-price, expense build-up, defaults fill & recompute
npm run test:landed-cost    # Incoterm superset chain, category filtering, RODTEP, vendor comparison
npm run test:pnl            # booked expenses reduce actual margin (3 cases)
npm run test:packs          # CountryPack settingsDefaults + IndustryPack registry
npm run test:gst-prep       # prep-pack aggregation
npm run test:doc-engine     # 22 rule fixtures + 29 model assertions; FY numbering rollover
npm run test:compliance     # status boundaries + alert windowing
npm run test:today          # lead SLA, ordering/severity, doc numbering
```

Not executed (require a live database or external credentials): `test:security:live`, `test:billing:razorpay`, `test:inbox`, `test:jobs`, `test:integration*`, `eval:ai`.

Capabilities were marked 🔴 only after grepping the schema, `src/actions`, `src/lib`, and `src/app` for the capability's vocabulary and finding no model, action, or route — not on the absence of a UI label alone.
