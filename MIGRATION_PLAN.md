# Zimplifyed.ai — Migration Manifest (from anabyn-website)

Source: `/Users/abinbabu/anabyn-website` · Target: this repo.
Decisions locked in: **next-auth + Postgres/Prisma** (drop Firebase), **Next.js 16** (adapt, don't downgrade), generic CRM/ops core only (no textile modules).

## 1. Stack changes required

| Concern | anabyn-website | Zimplifyed.ai |
|---|---|---|
| Framework | Next 15 (App Router, Turbopack) | Next 16 (App Router) — audit `src/app/**` for Next 16 async-API / codemod changes before porting each route |
| Auth | Firebase Auth + custom claims (`role`, `tenantId`) via session cookie decoded in `middleware.ts` | next-auth v5 — replace claims with a `Membership` table (`userId`, `tenantId`, `role`); JWT callback embeds `tenantId`+`role` |
| Data | Firestore (`src/firebase/server.ts`, collections) | Postgres via Prisma — every `firestore.collection(x).doc(y)` call site becomes a Prisma model/query |
| File storage | Firebase Storage | needs replacement (S3/R2/Vercel Blob) — used by: order documents, payment proofs, receipts (OCR), sample photos, linecard PDFs |
| Password provisioning | `account-provisioning.ts` (Firebase Admin `generatePasswordResetLink`) | next-auth email/magic-link flow, or a custom set-password token table |
| Multi-tenancy | Host-based (`tenant-resolver.ts`, `tenant.ts`, `tenantTag()` helper) | keep the *pattern* (resolve tenant from subdomain, stamp every write) but resolve against Postgres `Tenant` table instead of a compile-time host map |

This is a rewrite of the data-access layer, not a copy-paste. Budget most of the effort here — every action in `src/actions/*.ts` touches Firestore directly.

## 2. Prisma schema — entities to model (from `src/lib/types.ts`, 2079 lines)

Core: `Tenant`, `User`/`Membership` (role, tenantId), `Task`, `AuditEntry`.

CRM: `UnifiedLead`, `Assignment`, `Inquiry`, `CompanyMember`, `UserProfile` (customer-side), `PartnerProfile`, `PartnerQuote`+`PartnerQuoteLineItem`.

Quoting/Invoicing: `Quote`+`QuoteLineItem`+`QuoteTemplate`, `Invoice`+`InvoiceLineItem`-equivalents+`InvoiceTemplate`, `RecurringInvoice`, `PaymentProof`.

Orders/Fulfillment: `Order`+`OrderLineItem`+`OrderProductSpec`, `Shipment`, `OrderDocument`, `OrderEvent`, `ShippingMilestone`, `AQLInspection`+`AQLPhoto`+`AQLCertification`, `QCApproval`, `PackingCarton`, `DesignApproval`, `ChecklistItem`, `ClaimStatus`-based `Claim`.

Samples: `SampleRequest`, `SampleInventoryItem`, `SampleMovement`, `SampleLoan`.

Finance: `Expense`+`ExpenseReceipt`, `OrderPnL`, `MarginRule`.

Vendors: `Vendor`, `VendorPortalProfile`, `VendorRFQ`, `VendorQuote`+`VendorQuoteLineItem`, `VendorRate`, `VendorNotificationLog`.

Inventory: `InventoryItem`, `StockMovement`.

Drop entirely (textile-specific, per scope decision): `Product`, `ProductVariant`, `ProductSpecification`, `Category`, `LinenCategoryId`, `ProductPricing`, `RateSheet`+`RateSheetItem`, `ParStockConfig`, `ProductionStage`.

`Permission`/`ROLE_PERMISSIONS` map in `types.ts` (lines 39–116) ports almost unchanged — it's pure logic, no Firestore dependency.

## 3. App routes to port (`src/app/[locale]/admin/**`, `portal/**`, `vendor-portal/**`)

Keep: `leads`, `kanban`, `contacts`, `customers`, `quotes`, `invoices`, `orders`, `finance`, `inventory`, `tasks`, `users`, `analytics`, `audit`, `claims`, `samples`, `vendors`, `notify`, `settings`, `setup`, `login`, `portal/*`, `vendor-portal/*`.

Drop: `linen-intelligence`, `pricing`, `rate-sheets`, `par-stock`, `production`, `whatsapp-leads` (fold into `leads` if needed).

Note: this repo has no `[locale]` i18n today (no next-intl). Decide whether Zimplifyed.ai needs i18n before porting locale-aware routing, or flatten routes to non-localized paths.

## 4. Components to port (`src/components/admin/**`, `src/components/portal/**`, `src/components/order/**`, `src/components/invoice/**`, `src/components/quote/**`, `src/components/rfq/**`)

Port as-is (UI logic, framework-agnostic): `data-table`, `panel-page-header`, `skeletons`, `empty-state`, `notification-bell`, `global-command-palette`, `keyboard-shortcuts`, `leads/*`, `inventory/*`, `orders/*`.

Needs rework (Firestore/Firebase-coupled): `ai-*-chat.tsx` (uses Genkit + server actions — port the action, keep UI), `super-admin-gate.tsx` (claims-based → session-based).

Also port: `src/components/app-shell/**` (AppShell, sidebar, mobile nav, dark mode) — this is the SaaS shell chrome, no Firebase coupling, drop in directly.

## 5. AI features to port

`src/ai/flows/`: `crm-assistant.ts`, `draft-invoice.ts`, `finance-insight.ts`, `founder-insight.ts`, `generate-quote-reply.ts` — these use Genkit + `@anthropic-ai/sdk`; port the flow logic, swap any Firestore reads for Prisma queries.

Drop: `generate-catalogue-image.ts`, `generate-linen-rationale.ts`, `generate-seo-metadata.ts`, `parse-spec-sheet.ts` (textile-specific).
Keep but evaluate: `parse-vendor-quote.ts`, `receipt-ocr.ts` action (generic OCR, useful for expense/finance module).

## 6. Multi-tenancy + billing (new work, not a port)

1. `Tenant` Prisma model (id, slug, name, plan, status, branding, stripeCustomerId).
2. Subdomain resolution in `middleware.ts`: `{slug}.zimplifyed.ai` → tenant lookup (edge-safe: cache in a KV/Edge Config, don't hit Postgres from middleware).
3. next-auth JWT/session callback embeds `tenantId` + `role`; every Prisma query in server actions filters `where: { tenantId }` (equivalent of anabyn's `tenantTag()`/`assertTenantContext()` — port that guard pattern against Prisma instead of Firestore).
4. Stripe: reuse `src/lib/stripe.ts` almost unchanged (it's SDK-only, no Firebase); add Checkout + webhook route + plan gating.
5. Tenant self-signup + first-admin provisioning (replaces `account-provisioning.ts`'s Firebase-specific bits with next-auth equivalent).

## 7. Explicitly out of scope for this port

All of anabyn's marketing site, blog, SEO landing pages, product catalog/config, GSM/thread-count/incoterm calculators, linen-intelligence, rate-sheets, par-stock, production tracking, and all textile domain data (`bed-linen-exporter-data.ts`, `towel-exporter-data.ts`, `common-*-faqs.ts`, `pricing-catalog.ts`, `margin-rules.ts` beyond the generic `MarginRule` shape).

## 7b. Progress (2026-07-06)

Ported ahead of the suggested order, from anabyn-website's vendor-rate-calculator/deal-rail/buyer-tracking commits:

- `Vendor`, `VendorRate`+`VendorRateTier`, `Quote`+`QuoteLineItem`, `Invoice`+`InvoiceLineItem`, `Order`, `OrderBuyerTrack` Prisma models + first migration.
- `src/actions/vendors.ts`, `vendor-rates.ts`, `quotes.ts`, `invoices.ts`, `orders.ts`, `order-track.ts`.
- `src/lib/pricing-buildup.ts` (expense%/margin% build-up, ported near-verbatim, `margin-rules.ts` math inlined).
- Pages: `/dashboard/vendors(/[id])`, `/dashboard/quotes(/[id])`, `/dashboard/invoices(/[id])`, `/dashboard/orders/[id]`, public `/track/[token]`.
- `src/components/deal-rail.tsx` (server-rendered, resolved records passed as props — no Firestore realtime listener equivalent).
- Dashboard funnel-leak alerts (accepted-quote-no-order, shipped-order-no-invoice, overdue-receivables).
- Nav entries for Vendors/Quotes/Invoices/Orders in `nav-items.ts`.

**Deliberately dropped** (textile-specific, per section 7 exclusions): `pricing-groups.ts` category bucketing, any `ProductPricing`/rate-sheet linkage — `VendorRate.sku` is a plain string key, not tied to a product catalog.

**Not yet done**: full quote/invoice line-item edit UI (only create), RFQ/lead linkage beyond `leadId` string, AQL/shipment milestones, vendor portal, `super-admin-gate`, AI flows, Stripe/billing, multi-tenant subdomain middleware. Local dev DB note: `prisma.config.ts` needed an explicit `datasource.url` for `prisma migrate dev` under Prisma 7; local Postgres has no `postgres` role, so dev commands should point `DATABASE_URL` at a role that exists on the machine (e.g. `postgresql://<os-user>@localhost:5432/zimplifyed`) rather than the `.env.local` placeholder.

## 8. Suggested execution order

1. Prisma schema (core + CRM entities) + next-auth tenant/role wiring — foundation everything else depends on.
2. Port `app-shell` + `admin` layout/login/users/settings — get a logged-in shell working end to end.
3. Port `leads`/`kanban`/`contacts`/`customers` (CRM core) — first vertical slice, proves the data-access pattern.
4. Port `quotes` → `invoices` → `orders` (the money pipeline).
5. Port `finance`, `inventory`, `samples`, `vendors`, `claims`, `tasks`, `analytics`, `audit`.
6. Port `portal` + `vendor-portal` customer/vendor-facing views.
7. AI flows.
8. Billing/Stripe + signup flow.
9. Rebrand shell (logo, name, theme tokens) — mostly already neutral in `app-shell`.

Each step should end with `npm run typecheck && npm run lint` green before moving to the next.
