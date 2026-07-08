# Spec: Design System & Module Conventions

The reference PRODUCT_PLAN §6's "definition of done" points at. Codifies what the shell already does so 30 future modules stay consistent. Aesthetic: minimalist, premium, dense-but-calm — an ops tool used 6 hours/day.

---

## 1. Tokens (Tailwind v4 CSS vars — extend `globals.css`, never inline hex)
- Semantic names only: `surface`, `ink`, `ink-soft`, `muted`, `line`, `brand`, `brand-gradient`, `success`, `warning`, `danger`, `info` (existing classes like `text-ink`, `bg-surface`, `glow-brand` confirm the pattern — inventory and complete the set).
- Dark mode: every var overridden under `:root.dark` (anabyn lesson — specificity: `.dark` on root, or `:root` wins).
- Type scale: page title `text-2xl/semibold tracking-tight`, section `text-lg/medium`, body `text-sm`, meta `text-xs text-muted`. Numbers in tables: `tabular-nums`.
- Spacing rhythm: 4px base; cards `rounded-2xl border border-line`, sheets `rounded-t-2xl` mobile.
- Status colors are **semantic per domain**, mapped once in `src/lib/status-styles.ts`: draft=muted, sent/active=info, accepted/paid/approved=success, overdue/rejected=danger, expiring=warning. No module invents its own.

## 2. Page anatomy (every list module identical)
`PanelPageHeader` (title · primary action · filters) → `DataTable` (URL-state sort/filter/pagination — shareable per coding rules) → row click = detail. **Detail pages:** tabbed — Overview · Line items · Documents · Timeline · Finance · AI (PRODUCT_PLAN §3); tabs hidden by permission. **Create/edit:** right-side Sheet for simple records (vendor, lead, task); full-page builder for complex (quote, cost sheet, doc-set review). Builders autosave drafts.

## 3. Required states (definition of done, per module)
1. **Empty state**: illustration-light, one sentence, primary CTA, optional "seed demo" — never a bare empty table.
2. **Loading**: skeleton matching final layout (skeleton components exist — reuse).
3. **Error**: inline retry, never a blank page; server-action errors render field-level via structured `{error, fieldErrors}`.
4. **Forbidden**: permission-gated content shows nothing (nav hides it); direct-URL hit → `/no-access`.
5. **Mobile**: table → card list at `sm`; primary action reachable (sticky bottom on builders); test at 375px.
6. **One AI assist** minimum, using `<AiDraftActions>` (AI_PLATFORM §2) — placement: top-right of builders ("Draft with AI ✦"), findings panel on review screens.

## 4. Interaction rules
- ⌘K command palette is the universal jump (port `global-command-palette` per MIGRATION §4); every new module registers its entities + create action.
- Destructive actions: two-step (confirm dialog naming the object), never on swipe/hover.
- Toasts for outcomes (success 3s, error sticky w/ retry); optimistic UI only where rollback is trivial (task check-off), never on money objects.
- Dates: absolute + relative ("12 Jul · in 4 days"); all times IST-labeled until multi-region.
- Currency: always with code (`USD 12,400.00`), INR in Indian digit grouping (`₹12,40,000`).
- Buyer/vendor-facing surfaces (`/track`, quote links, PDFs): separate lighter theme, tenant branding (logo/color from Tenant), "Powered by Zimplifyed" per plan (BILLING §1) — these pages are marketing (GTM §3.6): fastest load, zero login walls.

## 5. Writing in-product (voice)
Plain language, no export-jargon unexplained on first use (tooltip defs from the knowledge corpus); buttons = verbs ("Generate doc set", not "Submit"); errors say what to do next ("Add your AD code in Settings → Compliance"); AI outputs always labeled ("Drafted by AI — review before sending"). Empty states teach ("Quotes you send appear here. Most exporters start by…").

## 6. Component inventory to build/port (gap list)
Have: shell/sidebar/topbar, data-table, panel-page-header, skeletons, sheets, google-button. Port from anabyn: empty-state, notification-bell, command palette, keyboard-shortcuts. Build new: `<AiDraftActions>`, upsell sheet (BILLING §5), usage meter, status badge (from status-styles), diff view (DOC_ENGINE §1.3), findings panel, checklist card (ONBOARDING §6), tenant switcher (SELF_SERVE Phase B).

## 7. Enforcement
`docs/` screenshots of one canonical module (quotes) as the visual reference · PR checklist = §3's six states · new-module scaffold script (`scripts/new-module.ts`) generating page/action/test skeletons wired to conventions — cheaper than review nitpicks.
