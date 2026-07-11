# Decision log

Shared record for the CXO agents (ceo/cto/cpo/cfo/cmo). One line per decision, newest last.
Format: `- YYYY-MM-DD [ROLE] <decision> — <why> — reversibility: one-way|two-way — <role-specific fields>`

Agents: read this before deciding; don't relitigate settled calls. Append, never rewrite history.

- 2026-07-11 [CTO] Added root + dashboard error.tsx boundaries and converted /welcome page to a Route Handler (cookie deletion is only legal there in Next 16) — blank-dashboard incident on simplifi-ai.vercel.app was a stale deployment (pre-11b4374 Prisma client querying Tenant.stripeCustomerId) against the migrated DB (providerCustomerId); with no error boundary the P2022 rendered as a blank screen — reversibility: two-way — debt: destructive column renames (stripeCustomerId→providerCustomerId) shipped without expand-contract; adopt expand/backfill/contract migrations before >1 real tenant. Also: retire or re-point the stale "simplifi-ai" Vercel project so only the zimplifyed.ai project serves prod.
