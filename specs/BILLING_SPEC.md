# Spec: Billing & Plans (SELF_SERVE Phase C)

Dual-rail payments (Razorpay India / Stripe international), plan gating, usage billing off MeterEvent, tenant lifecycle. Blocks GTM 2026Q4 paid launch. `Tenant` already has `plan/status/stripeCustomerId/stripeSubscriptionId`.

---

## 1. Plans & entitlements (single source of truth)
`src/lib/billing/plans.ts` — config object, no DB (changes are deploys; per-tenant overrides via admin-console feature flags later):
```ts
{ free:    { seats: 2,  aiActions: 20,  docSets: 0,   features: [core], branding: true  },
  starter: { seats: 5,  aiActions: 200, docSets: 10,  features: [+doc_generator, +rfq_broadcast] },
  business:{ seats: -1, aiActions: 1000,docSets: 50,  features: [+compliance_vault, +lc_advisor, +screening, +custom_roles, +whatsapp], branding: false },
  enterprise: { ...business, custom: true } }
```
Overage: doc-sets and AI actions purchasable as packs (₹/unit from GTM §5 per-outcome pricing) — metered rail, invoiced monthly.
**Gate helper:** `requireFeature(tenantId, 'doc_generator')` → throws `{error:'plan_gate', feature}`; UI catches → upsell sheet (never a dead error). Seat check at invite time (`countMemberships < seats`). Limits check = MeterEvent monthly rollup vs plan (AI_PLATFORM §3).

## 2. Payment rails
Detection: tenant billing-country field (settings; default from wizard `primaryMarkets`? no — billing country asked at checkout). India → **Razorpay** (UPI/netbanking/cards, subscriptions API, GST-compliant); else → **Stripe** Checkout + customer portal.
- One internal abstraction: `src/lib/billing/provider.ts` → `createCheckout`, `openPortal`, `cancelAt`, `syncFromWebhook` — two adapters. Tenant stores `billingProvider`, `providerCustomerId`, `providerSubscriptionId` (rename the stripe-specific columns in this migration).
- **Webhooks:** `/api/billing/razorpay` + `/api/billing/stripe`; verify signatures; **idempotency table** `WebhookEvent { provider, eventId @unique, processedAt }` — replay-safe (SELF_SERVE §10 edge case). Events → single reducer: set `plan`, `status`, `currentPeriodEnd`, write DomainEvent `billing.*`.
- GST invoices: Razorpay handles for India (tenant GSTIN captured at checkout); Stripe Tax for the rest. Receipts emailed + listed at `/dashboard/settings/billing`.

## 3. Trial & lifecycle state machine
`trial(14d, business entitlements) → active | free-downgrade` · `active → past_due (dunning: provider retries + our WhatsApp/email nudges day 1/4/8) → suspended (day 15)` · `suspended → active (payment) | pending_deletion (day 60, owner-initiated or 180d auto-flag for review — never silent auto-delete)` · `pending_deletion → deleted (7d grace, export reminder)`.
- Enforcement point: dashboard layout reads `tenant.status` — `suspended` renders lock screen (owner sees billing page; members see friendly notice); **data never deleted for non-payment**, only for explicit deletion.
- Downgrade semantics: over-limit resources go **read-only**, never hidden (e.g. free tier with 4 members: all keep read access, writes blocked for seats beyond 2, owner picks who).
- Deletion: soft-flag → cron hard-cascade (Prisma onDelete cascades cover most; storage purge job; retain audit stub {tenantId, name, deletedAt} + final invoice records for statutory retention).

## 4. Data export (trust requirement, SELF_SERVE §5)
Owner-only `/dashboard/settings/export`: async job → zip {per-module CSVs + full JSON + documents folder} → signed URL (24h) + email. Meter it (abuse), rate-limit 1/day.

## 5. UI surfaces
`/dashboard/settings/billing`: current plan card, usage meters (seats/AI/doc-sets vs limits), upgrade CTA → checkout, portal link, invoices list, cancel (retention prompt: pause-1-month offer — GTM churn counter). Upsell sheet component (shared, triggered by plan_gate errors) shows the specific locked feature + one-click upgrade. Trial banner with days remaining.

## 6. Tests that matter
Webhook replay idempotency · trial expiry → downgrade job (fake timers) · plan_gate on every gated action (loop the feature list) · seat enforcement incl. downgrade read-only path · cross-provider switch guard (tenant can't have both rails live) · suspended-tenant lock screen renders for member vs owner.

## 7. Build order
1. plans.ts + requireFeature + upsell sheet (gates work even before payments — "contact us" CTA).
2. Provider abstraction + Stripe adapter (faster to certify) → checkout/portal/webhooks.
3. Razorpay adapter + GSTIN capture.
4. Lifecycle machine + dunning + lock screens.
5. Usage meters UI + overage packs.
6. Export job.
