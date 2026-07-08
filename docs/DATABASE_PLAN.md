# Database Plan — Zimplifyed.ai (Supabase Postgres)

Target: Supabase project `nputfelxwskklujcuuer`. Schema source of truth is
[`prisma/schema.prisma`](../prisma/schema.prisma); 12 migrations already exist in
`prisma/migrations/` and will create everything below with one command once
`DATABASE_URL` is set.

## Architecture

- **Multi-tenant SaaS**: almost every table carries `tenantId → Tenant` with
  `onDelete: Cascade`. Tenant isolation is enforced at the app layer via Prisma
  queries scoped by tenant (not Supabase RLS — Prisma connects as the `postgres`
  role over the connection pooler).
- **Auth**: NextAuth PrismaAdapter tables (`User`, `Account`, `Session`,
  `VerificationToken`) + `Membership` (role per user per tenant) + `Invite`
  (pending seats).
- **IDs**: cuid strings generated client-side by Prisma. Timestamps
  `createdAt`/`updatedAt` on all mutable tables.

## Table groups (32 tables, 22 enums)

### 1. Tenancy & Auth
| Table | Purpose | Key constraints |
|---|---|---|
| `Tenant` | Company/workspace; plan, status, branding, Stripe ids | unique `slug`, `stripeCustomerId`, `stripeSubscriptionId` |
| `User` | NextAuth user (Google or email+password) | unique `email` |
| `Account` | OAuth provider link | unique `(provider, providerAccountId)` |
| `Session` | DB sessions | unique `sessionToken` |
| `VerificationToken` | Email verification | unique `(identifier, token)` |
| `Membership` | Role per user per tenant (11 roles: customer…super_admin, vendor) | unique `(userId, tenantId)` |
| `Invite` | Pending seat consumed on first sign-in | unique `(tenantId, email)` |

### 2. CRM
| Table | Purpose |
|---|---|
| `Lead` | Pipeline: source (whatsapp/inquiry/rfq/…), 8 stages, quality rating, follow-up date, assignee |
| `Task` | Team tasks with priority/status, polymorphic link (order/customer/invoice/general) |

### 3. Vendors & Sourcing
| Table | Purpose |
|---|---|
| `Vendor` | Supplier directory with contact + bank details |
| `VendorRate` | SKU rate card per vendor (per_piece/per_kg/per_metre), MOQ, lead time, preferred flag |
| `VendorRateTier` | Quantity-break pricing under a rate |
| `VendorRfq` | RFQ broadcast; status open/awarded/closed; unique `awardedQuoteId` |
| `VendorRfqInvite` | Which vendors were invited — unique `(rfqId, vendorId)` |
| `VendorRfqQuote` | Vendor responses — unique `(rfqId, vendorId)` |

### 4. Quoting & Costing
| Table | Purpose |
|---|---|
| `Quote` | Customer quote (draft→sent→accepted/declined/expired), currency, total, optional link to Lead and Order |
| `QuoteLineItem` | Lines with cost, expense %, margin %, unit price |
| `CostSheet` | 1:1 with Quote — Incoterm-aware landed cost, RoDTEP % |
| `CostSheetLine` | Cost components (material, freight, duties, … 10 categories) |
| `HsCode` | AI HS-code classification cache — unique `(tenantId, description)` |

### 5. Money
| Table | Purpose |
|---|---|
| `Invoice` | Status draft→sent→paid/partially_paid/overdue/void; balance due; credit/debit-note flag; optional Order link |
| `InvoiceLineItem` | Same line shape as quotes |
| `IncentiveClaim` | RoDTEP / drawback / EPCG per order; claimable→claimed→received |

### 6. Orders & Logistics
| Table | Purpose |
|---|---|
| `Order` | Confirmed order → in_production → shipped → in_transit → delivered; product, qty, Incoterm, ports |
| `ShipmentMilestone` | Timeline (gate_in, SOB, transhipment, arrival, DO issued, delivered) — unique `(orderId, type)` |
| `OrderBuyerTrack` | Tokenized buyer-visible tracking link — unique `token` |
| `ExportDocument` | Versioned proforma/CI/packing list/COO snapshots (JSON) — unique `(orderId, type, version)` |
| `LetterOfCredit` | Raw LC text + AI review output (workable flag, issues JSON) |

### 7. Compliance & Governance
| Table | Purpose |
|---|---|
| `ComplianceItem` | Licence vault (IEC, AD code, GST LUT, RCMC, …) with expiry + renewal lead days |
| `ScreeningCheck` | Denied-party screening results (clear / potential_match / manual_attestation) with raw matches JSON |
| `AuditEntry` | Full audit log: actor, action (14 types), before/after JSON, indexed by `(tenantId, createdAt)` |
| `Document` | File attachments — polymorphic `(collection, documentId)`, storage key (Supabase Storage) |

## Creation steps (once connection string is available)

1. Add to `.env` (Supabase → Project Settings → Database):
   ```
   DATABASE_URL="postgresql://postgres.nputfelxwskklujcuuer:[PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.nputfelxwskklujcuuer:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres"
   ```
2. Add `directUrl = env("DIRECT_URL")` to the `datasource db` block (needed
   because migrations can't run through PgBouncer transaction pooling) and
   `url = env("DATABASE_URL")`.
3. `npx prisma migrate deploy` — applies all 12 migrations, creating every
   table/enum/index above.
4. `npx prisma generate`, then optionally `npx tsx prisma/seed.ts`.
5. Verify: `npx prisma studio` or check Supabase Table Editor.
