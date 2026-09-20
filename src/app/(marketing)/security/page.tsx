import Link from "next/link";
import { CONTACT_EMAIL, breadcrumbLd, jsonLd } from "@/lib/site";

export const metadata = {
  title: "Security — how Zimplifyed protects your trade data",
  description:
    "How Zimplifyed keeps export and import data safe: workspace isolation on every query, role-based access, an audit trail, TLS encryption, AES-256-GCM credential storage and full data export.",
  alternates: { canonical: "/security" },
};

// Every statement here must be true of the shipped product today. Add a claim only after the
// control exists in code or in a signed report — "safe and secure" is proven, never adjectived
// (docs/SEO_ROADMAP.md §2.3).
const sections = [
  {
    heading: "Workspace isolation",
    body: "Each company works in its own workspace. Every database read and write is scoped to that workspace by a data-layer guard that runs on each query, so one company's buyers, quotes, orders and documents can't be returned to another. Automated isolation tests run against this guard.",
  },
  {
    heading: "Role-based access and audit trail",
    body: "Workspace admins give each teammate a role (Admin, Sales, Finance, Procurement, Production, Logistics, Marketing or Viewer), and each role sees only what it needs. Changes to records are written to an audit trail showing who changed what and when.",
  },
  {
    heading: "Encryption",
    body: "All traffic to Zimplifyed is encrypted in transit over TLS. Credentials you connect, such as email or messaging integrations, are stored with envelope encryption: each secret gets its own AES-256-GCM key, which is wrapped by a master key kept outside the database. Credentials are never logged or sent back to your browser.",
  },
  {
    heading: "Private share links",
    body: "Buyers and vendors get quotes, tracking and document sets through unguessable links, so they don't need an account. These links are excluded from search engines.",
  },
  {
    heading: "Your data stays yours",
    body: "Workspace admins can export all workspace data as CSV files at any time. If you close your account, your data stays available for export for a reasonable period before deletion, as set out in our Terms of Service.",
  },
  {
    heading: "AI and your data",
    body: "AI features work on the data in your own workspace to draft documents, check consistency and suggest next steps. The AI is decision support: you review and approve anything that leaves your office.",
  },
  {
    heading: "Certifications",
    body: "We don't hold a SOC 2 or ISO 27001 certification yet. When an audit is under way, we'll publish its status on this page.",
  },
  {
    heading: "Report a security issue",
    body: `If you think you've found a vulnerability, email ${CONTACT_EMAIL} with the details. We'll acknowledge it and keep you updated while we investigate. Please don't access or change other customers' data while testing.`,
  },
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(breadcrumbLd([{ name: "Home", path: "/" }, { name: "Security", path: "/security" }]))}
      />
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Security at Zimplifyed</h1>
      <p className="mt-3 text-muted">
        Your buyers, prices, margins and shipment documents are the most sensitive data your business has. This page
        explains what we do to protect them today, and says plainly what we don&apos;t have yet.
      </p>
      <p className="mt-2 text-sm text-muted">Last updated: September 19, 2026</p>

      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold text-ink">{section.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-12 text-sm text-muted">
        See also our{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
          Terms of Service
        </Link>
        .
      </p>
    </div>
  );
}
