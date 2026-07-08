# Spec: Security Baseline (TEAMS §3.1 as an actionable checklist)

Engineering-owned until the 2028 security hire. Doubles as the source for the public `/security` page and the SOC 2 head start (program starts 2027H1). Status boxes live here; review monthly.

---

## 1. Identity & access (internal)
- [ ] 2FA enforced: Google Workspace, GitHub, Vercel/hosting, DB provider, Stripe/Razorpay, domain registrar (registrar is the forgotten one — it owns everything).
- [ ] Password manager for the team; no shared credentials in chat.
- [ ] Least privilege: prod DB access = founder + on-call only, via individual creds; no prod creds on laptops in plaintext.
- [ ] Offboarding checklist (revoke within 24h): workspace, repo, hosting, DB, billing dashboards, MCP/API keys.

## 2. Application security
- [ ] **Cross-tenant tests CI-blocking** (SELF_SERVE §1.4) — one read + one write attempt per action file; the crown jewels.
- [ ] Prisma tenant-scoped client extension is the only client exported; `prismaUnscoped` import restricted by lint rule to `src/lib/platform-admin/` + jobs.
- [ ] Rate limits (ONBOARDING §7): auth, invites, org-create, slug-check, AI endpoints, tools pages.
- [ ] Secrets: hosting env vars / secret manager only; `.env*` gitignored (verify history — if a secret ever landed in git, rotate it); quarterly key rotation for model providers + payment webhooks.
- [ ] File storage (fixes ROADMAP R2): R2/S3 private buckets, signed URLs 15-min expiry, content-type allowlist, size caps, no public listing; uploads virus-scan deferred (flag) but path-traversal/extension checks now.
- [ ] Headers: CSP (start report-only), HSTS, X-Frame-Options deny except `/track` embeds if needed, referrer-policy.
- [ ] Dependency hygiene: Dependabot + `npm audit` in CI (fail on critical); lockfile committed; no postinstall-script packages without review.
- [ ] Session: httpOnly/secure/sameSite cookies (next-auth default — verify), 15-min role refresh (ONBOARDING §7), sign-out revokes, session invalidation on membership removal (Phase B).

## 3. Data protection
- [ ] Postgres: encrypted at rest (provider default — confirm), TLS enforced, daily automated backups, **quarterly restore drill** (a backup you haven't restored is a hope, not a backup) — calendar it.
- [ ] PII inventory doc: what we store (buyer contacts, bank details on invoices, IEC/GST), where, retention. Feeds DPDP compliance (TEAMS §2.1) and the deletion cascade (BILLING §3).
- [ ] Error monitoring (Sentry-class) with PII scrubbing rules before enabling session replay anywhere.
- [ ] Logs: no request bodies with financial data; tenant/user ids yes, payloads no. 90-day retention.

## 4. AI-specific (see AI_PLATFORM §4)
- [ ] Prompt-injection fixtures in eval CI: hostile buyer-PO/LC text attempting exfiltration or instruction override — assert containment.
- [ ] Copilot retrieval permission checks tested per role (sales cannot pull margins).
- [ ] Model-provider DPAs on file; per-tenant no-training default; corpus ingestion strips tenant identifiers.
- [ ] AI cost anomaly alert (10× daily baseline per tenant → flag; abuse or bug).

## 5. Incident response (one page, print it)
Severities: SEV1 breach/data-leak/payments-down · SEV2 auth or tenant-isolation bug, no confirmed leak · SEV3 rest. SEV1 runbook: contain (revoke/disable) → assess scope via audit log + DomainEvents → notify affected tenants <72h (DPDP duty) → postmortem within 7 days, blameless, filed in repo. On-call = founder until 2028; escalation contacts (counsel, hosting support, payment providers) listed in the runbook, tested annually with a tabletop exercise.

## 6. Public trust surface
- [ ] `/security` page: controls summary, data location (region named), subprocessor list, disclosure contact + `security.txt`.
- [ ] Vulnerability disclosure: acknowledge <48h, fix-or-plan <30d, hall-of-fame page (bounty-lite per TEAMS §3.2).

## 7. SOC 2 runway (start 2027H1 — items above ARE the controls)
Pick automation platform (Vanta-class) → gap assessment → policies generated from actual practice (this doc) not templates → Type I audit ~2027H4 → Type II observation window → report mid-2028. Owner: eng lead + fractional vCISO for audit season.
