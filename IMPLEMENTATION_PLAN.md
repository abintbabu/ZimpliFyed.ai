# Zimplifyed.ai — Detailed Implementation Plan (Exporter Operating System)

**Benchmark standard:** each domain built to the level of the best-in-class app in that category — CRM (HubSpot/Attio), invoicing (Zoho Invoice/Stripe), pricing/CPQ (Salesforce CPQ), ERP/inventory (NetSuite/Unleashed), production (Katana/Odoo MRP), shipment tracking (Flexport/project44) — but compressed to SMB-exporter simplicity per PRODUCT_PLAN §1.

**Relationship to other docs:** PRODUCT_PLAN = what & why. ROADMAP = live status. This doc = *how*, at the model/action/page level, sequenced into build waves. When it conflicts with ROADMAP's Now/Next/Later, ROADMAP wins on timing.

_Created: 2026-07-08_

---

## 0. Gap audit — built vs. best-in-class

| Domain | Built today | Missing for best-in-class |
|---|---|---|
| CRM | Leads pipeline | **Buyer/Company + Contact entities**, activity timeline, follow-up cadences, lead→buyer conversion, buyer credit profile |
| Pricing/CPQ | Quotes + CostSheet + pricing-buildup + vendor rate tiers | **Product/SKU catalog** (quotes are free-text lines), price lists per buyer/market, margin guardrail enforcement, quote versioning & approval, buyer accept/negotiate link |
| Invoicing | Invoice + line items | Line-item **edit** UI (create-only), credit notes, **PaymentSchedule/receivables**, partial payments, multi-currency realization, e-BRC/FIRC recon |
| ERP/Inventory | — (nothing) | Product, Warehouse, StockLot, StockMovement, reservations against orders, landed-cost valuation |
| Production | — (nothing) | WorkOrder + stage checkpoints, vendor-PO tracking for traders, QC/AQL, packing/cartonization |
| Tracking | ShipmentMilestone + `/track/[token]` | **Shipment as first-class entity** (container/BL/vessel), demurrage countdown, carrier API ingestion, exceptions feed |
| Finance | Order P&L, incentive claims | Cash-flow forecast, forex exposure, expense capture, founder brief |

Everything below is organized to close these gaps without rework: **entities first, workflows second, intelligence third.**

---

## 1. Data model plan (Prisma) — the spine

All models: `tenantId` + tenant-scoped client extension, `createdById`, audit on every mutation. Add in three schema migrations (one per wave) to keep review sane.

### Migration 1 — master data (Wave 1)
```prisma
model Buyer {            // company, not contact
  id, tenantId, name, country, address, taxIds Json,
  paymentTermsDefault, currencyDefault, creditLimit Decimal?,
  riskNotes, screeningStatus, source,           // promoted-from-lead link
  contacts Contact[], activities Activity[]
}
model Contact { buyerId, name, email, phone, whatsapp, role, isPrimary }
model Activity {         // universal timeline: CALL|EMAIL|WHATSAPP|MEETING|NOTE|SYSTEM
  entityType, entityId, kind, subject, body, dueAt?, doneAt?, assigneeId?
}
model Product {          // the SKU catalog everything hangs off
  sku, name, description, hsCodeId?, uom, category,
  specs Json,            // fabric/GSM/size — flexible per vertical
  defaultCostSheetId?, photos String[], active
}
model PriceList { name, currency, buyerId?, market?, validFrom, validTo }
model PriceListItem { priceListId, productId, incoterm, unitPrice, moq }
```
Relate existing models: `QuoteLineItem.productId?`, `InvoiceLineItem.productId?`, `Order.buyerId?`, `Lead.convertedBuyerId?`. Nullable FKs → zero breakage, backfill later.

### Migration 2 — execution & logistics (Wave 2)
```prisma
model Shipment {
  orderId, incoterm, modeOfTransport, portOfLoading, portOfDischarge,
  vesselVoyage?, containerNos String[], blNo?, blDate?, sobDate?, etaDate?,
  freeDaysDestination Int?, status, forwarderId?
  // ShipmentMilestone gets shipmentId (keep orderId for back-compat)
}
model Forwarder { name, contacts Json, lanes Json }
model FreightQuote { forwarderId, lane, mode, equipment, rate, currency, validTo, shipmentId? }
model Warehouse { name, address, type }        // OWN | VENDOR | CFS | PORT
model StockLot {
  productId, warehouseId, qty, uom, unitCost, currency,
  sourceType, sourceId,                        // VENDOR_PO | PRODUCTION | ADJUSTMENT
  reservedForOrderId?
}
model StockMovement { lotId, kind, qty, fromWarehouseId?, toWarehouseId?, refType, refId, at }
model WorkOrder {                              // trader: vendor PO; manufacturer: production order
  orderId, vendorId?, kind,                    // VENDOR_PO | PRODUCTION
  qty, dueDate, status, stages WorkOrderStage[]
}
model WorkOrderStage { name, seq, plannedAt?, startedAt?, completedAt?, qtyDone?, blockedReason? }
model QcInspection { workOrderId?, shipmentId?, aqlLevel, sampleSize, defectsFound Json, result, photos String[], buyerSignoffAt? }
model PackingList { shipmentId, cartons Json, totalNetWt, totalGrossWt, totalCbm, containerPlan Json }
model SampleRequest { buyerId, productId?, status, courier?, awb?, cost?, recoveredAmount?, approvalStatus }
```

### Migration 3 — money (Wave 3)
```prisma
model PaymentSchedule { invoiceId?, orderId, kind /*ADVANCE|BALANCE|LC|DA|DP*/, dueDate, amount, currency, status }
model PaymentReceipt { scheduleId?, invoiceId, amount, currency, fxRate, receivedAt, bankRef, fircRef? }
model BankRealization { invoiceId, ebrcNo?, fircNo?, realizedAmount, realizedAt, status }
model CreditNote { invoiceId, reason, amount, currency, status }
model Expense { orderId?, category, amount, currency, receiptFileId?, ocrData Json?, incurredAt }
model FxSnapshot { currency, rate, at }        // daily, for exposure & variance
```
Plus VISION §10 debt-clock items (small, do in Wave 1 while schema is open): `MeterEvent`, `AiFeedback` (accept/edit/reject on `AiInteraction`).

---

## 2. Wave plan

Each module ships to PRODUCT_PLAN §6 definition-of-done: list + detail + create/**edit** + permissions + audit + empty states + mobile + one AI assist.

### Wave 0 — Debt clearance (1 wk, parallel with ROADMAP "NOW")
The current sprint's items, unchanged: SELF_SERVE Phase A signup, ToS/Privacy (R1), R2/S3 file storage (R2), quote/invoice **line-item edit UI**, metering + AI-feedback tables, auth rate limiting (R5). Nothing in later waves starts until R1/R2 close — design partners can't touch the product before that.

### Wave 1 — Master data backbone: CRM + Catalog (2–3 wks)
The single biggest structural fix. Everything downstream (pricing accuracy, inventory, analytics) depends on Buyer and Product being real entities.
1. **Buyers module** (`/dashboard/buyers`): list, detail with tabs (Overview · Contacts · Quotes · Orders · Invoices · Activity · Compliance). "Convert lead → buyer" action; backfill script suggests buyers from existing quote/order `buyerName` strings (AI-assisted dedupe).
2. **Activity timeline + follow-ups**: `Activity` renders on buyer/lead/order detail; follow-up = activity with `dueAt`, surfaces in Tasks and (later) founder brief. AI assist: draft follow-up nudge from timeline context.
3. **Products module** (`/dashboard/products`): SKU CRUD, spec JSON editor with per-category templates, HS code link, photos. Quote/invoice/order line-item pickers get product autocomplete (free-text still allowed — never block a deal on catalog hygiene).
4. **Price lists**: per-buyer/market price lists; quote builder pre-fills from price list, shows margin vs cost sheet, **soft-blocks below margin floor** (owner-role override, logged).
5. **Quote v2**: versioning (revise creates v+1, chain visible), buyer-shareable link with accept / request-changes (extends `/track` token pattern), expiry.

**Exit:** a lead becomes a buyer, gets a product-based quote from a price list with enforced margin, accepts via link → order created with real FKs end-to-end.

### Wave 2 — Execute & track: Shipments, Inventory, Production (4–5 wks)
1. **Shipments module** (`/dashboard/shipments`): promote milestones into Shipment entity; detail = Overview · Containers · Milestones · Documents · QC · Packing. Demurrage/detention countdown from `etaDate + freeDays`. `/track/[token]` upgraded to shipment timeline. Carrier API ingestion deferred to Wave 4 — manual milestone entry with AI paste-parse ("paste the forwarder's status email") bridges the gap cheaply.
2. **Work orders**: trader flow (vendor PO from awarded RFQ → in-production → ready → inspected) and manufacturer flow (custom stage templates per tenant: cutting→stitching→finishing→packing). Delay alert = stage past `plannedAt` → task + notification. Vendor portal (Phase 5 in PRODUCT_PLAN) gets a minimal slice now: vendor updates stage status via tokenized link — no login, same pattern as `/track`.
3. **Inventory (lean)**: stock lots created on work-order completion or manual receipt; reserve against orders; movement ledger; balance by product×warehouse. Explicitly **not** double-entry ERP accounting — quantity + landed unit cost only. Valuation feeds order P&L actuals.
4. **QC & packing**: AQL calculator (lot size → sample size/accept/reject from ANSI tables), photo-checklist inspections, buyer sign-off via track link. Packing list builder computes carton/weight/CBM and container utilization (20'/40'/40'HC/LCL), generates the PL export document.
5. **Freight desk (light)**: forwarder directory, freight quotes per lane with history, attach chosen quote to shipment → flows into cost sheet actuals.
6. **Sampling**: request → courier/AWB → approval per buyer; sample cost recovery tracked to invoice.

**Exit:** an order shows live production stages, reserved stock, a packed container plan, and a buyer-visible shipment timeline — margin actuals updating as costs land.

### Wave 3 — Money: receivables, cash, reconciliation (3 wks)
1. **Payment schedules & receivables** (`/dashboard/payments`): schedules auto-created from quote terms (30% advance/70% against BL etc.); receipts with FX rate; aging view (DSO, overdue buckets by buyer); AI overdue-chaser drafts (human-approved send).
2. **Credit notes** + invoice edit polish; GST-vs-commercial invoice alignment check (cross-doc consistency rule #1).
3. **e-BRC/FIRC reconciliation**: checklist per invoice, `BankRealization` records, "unrealized export proceeds" report (FEMA timeline countdown).
4. **Forex exposure**: open receivables by currency, booked vs realized variance per order (needs `FxSnapshot` daily cron).
5. **Cash-flow forecast**: 13-week view from payment schedules (in) + vendor work-order dues and expenses (out) + incentive pipeline (probabilistic).
6. **Expenses with OCR**: receipt upload → AI extract → order allocation → P&L actuals.
7. **Daily founder brief**: morning digest (email + dashboard card) — cash position, at-risk shipments (demurrage, stage delays), expiring compliance, overdue receivables, stale leads, incentive deadlines. This is the retention feature; it consumes everything above, which is why it's last in the wave.

**Exit:** the dashboard answers "how much am I owed, by whom, including the government, and when does cash actually arrive."

### Wave 4 — Intelligence & platform (ongoing, after design-partner feedback)
- Cross-doc consistency AI per DOC_ENGINE_SPEC (golden-file evals first — VISION §10 gate) + CountryPack abstraction **before the next doc template** (risk R4).
- Copilot v2: tool-use over all modules ("which shipments risk demurrage this month?").
- Carrier tracking APIs, WhatsApp notifications, trade-portal lead imports, analytics suite (funnel, lane profitability, buyer concentration, vendor scorecards), buyer discovery + screening automation.
- Billing/plan tiers per BILLING_SPEC (gates GTM Q4 paid launch).

---

## 3. Cross-cutting build rules (beyond PRODUCT_PLAN §6)

1. **Entity-linking discipline:** new features must reference `Buyer`/`Product`/`Shipment` FKs, never new free-text name fields. Free text allowed only as fallback on line items.
2. **Tokenized external surfaces are one pattern:** buyer track, vendor stage updates, quote accept, QC sign-off all reuse the `/track`-style token model — one auth mechanism to secure and rate-limit.
3. **Every list is a saved-view:** URL-state filters (already the convention) + per-user saved views; this is what makes it feel like Attio/Linear rather than a form app.
4. **Derived money is computed, never stored** (P&L, exposure, forecast) — single source: schedules, receipts, expenses, cost sheets. Store only snapshots explicitly labeled as such.
5. **AI assists ship with feedback capture** from day one (`AiFeedback`) — the acceptance-rate metric (PRODUCT_PLAN §7) is unmeasurable otherwise.
6. **Migration order is sacred:** nullable FKs first, backfill scripts second, non-null constraints third — no big-bang data migrations on a live design-partner tenant.

## 4. Sequencing rationale & dependencies

```
Wave 0 (legal/storage/edit-UI) ──→ design partners can onboard
Buyer + Product (W1) ──→ inventory, receivables-by-buyer, analytics (W2/W3)
Shipment entity (W2) ──→ demurrage alerts, doc-generator autofill, carrier APIs
WorkOrder + Expense (W2/W3) ──→ true order P&L actuals ──→ founder brief
PaymentSchedule (W3) ──→ cash forecast ──→ founder brief
Golden evals + CountryPack ──→ any further doc templates (hard gate)
```

## 5. Success metrics per wave (extends PRODUCT_PLAN §7)

- **W1:** ≥80% of new quotes reference a Product; lead→buyer conversion used by every design partner.
- **W2:** ≥1 shipment per tenant with full stage + milestone trail; demurrage alert fires before a real deadline.
- **W3:** receivables aging matches the founder's spreadsheet (validated with 3 design partners); founder brief opened ≥4 days/week.
- **W4:** AI doc-consistency check catches ≥1 real discrepancy per tenant per month (the insurance-thesis leading indicator).
