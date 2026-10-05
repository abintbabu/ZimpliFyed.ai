# Module Gap Plan

Gap analysis of the target module map (CRM, Sales, Products, Inventory, Operations, Finance, Logistics, Export, Analytics) against the codebase as of 2026-10-05. Extends `EXPORT_OS_MASTER_PLAN.md`; where the two overlap, the master plan's models (Migrations A–C) win.

## Status

| Module | Exists | Missing |
|---|---|---|
| CRM | Lead, Buyer, Contact, Activity, Task | Chase ladders (master plan Wave 4) |
| Sales | Quote, Order, proforma as ExportDocument | Quote revisions, buyer accept link |
| Products | Product (SKU, specs JSON), PriceList, landed-cost, pricing build-up | Variants, spec axes, pricing matrices, margin rules |
| Inventory | — | Locations, stock, batches, movements |
| Operations | Vendor, VendorRfq, VendorRate | PO / job work, production, QC, packing operation |
| Finance | Invoice, Expense, BankRealization, cash-flow, order P&L | Payments + allocation, AR/AP aging, vendor bills, bank reconciliation |
| Logistics | ShipmentMilestone on Order | Shipment, containers, freight, shipping documents |
| Export | IEC/GST/LUT settings, HsCode, LC, incentives, screening, PI/CI/PL/COO | Shipping bill, eBRC, other certificates, bank pack |
| Analytics | cash-flow, order P&L, Today queue | Sales, profitability, inventory, customer, shipment dashboards |

## Decisions (made 2026-10-05)

- **Build order: Logistics first.** It is the only module with no master-plan wave and no data model beyond milestones; it is self-contained and every exporter needs it. Then Variants → Supply side → Money → Export extras → Analytics.
- **No general ledger.** Accounting = Tally/Zoho-style export via `TaxFilingExport` with `problems[]`. A GL is a separate product.
- **Batches included.** `StockBatch` (lot, expiry, supplier lot) is added to the Migration B inventory models; `StockMovement` references it.
- **Packing** = a `PackingList` operation (cartons, gross/net weight, CBM per line) feeding the existing packing-list document.
- **Tracking is manual** (milestones + container numbers). Carrier APIs are out of scope.
- Schema ships via `db push` with `DIRECT_URL`, one reviewed diff per phase, gated by `npm run db:check`. After any tenant-scoped model change run `npx tsx scripts/generate-tenant-scoped-models.ts`.

## Phases

### 0. Logistics (this phase)
Models: `Shipment` (one per booking; links to Orders), `ShipmentOrder` (join), `Container` (type, number, seal, FCL/LCL, weights, CBM), `FreightQuote` (forwarder, mode, rate, validity, status), `ShipmentDocument` metadata (BL/AWB, shipping bill number/date/port) — stored on `Shipment`.
`ShipmentMilestone` gains an optional `shipmentId`; existing order-level rows stay valid (expand, then contract later).
UI: `/dashboard/shipments` list + detail, "create shipment" from an Order, freight quote compare.

### 1. Variants and pricing depth (master plan Wave 3, Migration A)
`ProductVariant`, `SpecAxis`, `ProductSpecValue`, `PricingMatrix(+Cell)`, `MarginRule`, `IncotermLadder(+Step)`, `FxSnapshot`. Variant picker on quotes/orders.

### 2. Supply side (Wave 6, Migration B)
`PurchaseOrder(+Line)`, job work issue/receipt, `ProductionRun/Stage`, `QcInspection/Defect/Photo` (gate before shipping), `StockLocation`, `InventoryItem`, `StockBatch`, `StockMovement`, `ParStockConfig`, `PackingList`.

### 3. Money depth (Wave 7, Migration C)
`Payment` + `PaymentAllocation`, `VendorBill`, `BankAccount`, `BankStatementLine`, AR/AP aging, accounting export.

### 4. Export extras (Waves 2 and 7)
Certificate registry (expiry, file, order link), eBRC, shipping bill fields, bank document pack. CCO sign-off required before anything touching a licensed act.

### 5. Analytics
`/dashboard/analytics`: sales, profitability, inventory, customers, shipments, cash flow. Read-only over phases 0–4; built last.

## Sign-offs still needed
Any new pricing tier or marketing claim for these modules needs founder sign-off before shipping (see `roadmap-pending-signoffs` memory).
