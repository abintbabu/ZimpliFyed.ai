import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
};

const sections = [
  {
    heading: "1. Overview",
    body: "This Privacy Policy explains how Zimplifyed.ai (\"Zimplifyed\", \"we\", \"us\", or \"our\") collects, uses, and protects information when you use our website and dashboard (the \"Service\").",
  },
  {
    heading: "2. Information we collect",
    body: "Account information (name, email, company, and authentication details via Google or password sign-in); business data you enter or upload (buyers, quotes, orders, invoices, shipments, documents); usage data (pages visited, actions taken, AI feature usage, device/browser information); and information from cookies and similar technologies used to keep you signed in and understand product usage.",
  },
  {
    heading: "3. How we use information",
    body: "To provide, maintain, and improve the Service; to authenticate you and secure your account; to generate AI-assisted drafts and suggestions within your workspace; to communicate with you about your account, updates, or support requests; and to monitor for misuse, fraud, or abuse.",
  },
  {
    heading: "4. AI processing",
    body: "Where you use AI-assisted features, relevant business data may be sent to our AI model providers to generate output. We do not permit those providers to use your data to train their general-purpose models without your consent.",
  },
  {
    heading: "5. Data sharing",
    body: "We do not sell your personal or business data. We share data only with: service providers who process it on our behalf (hosting, storage, email, AI inference) under confidentiality obligations; other members of your organization's workspace, per their assigned permissions; and authorities where required by law.",
  },
  {
    heading: "6. Data storage and security",
    body: "Data is stored on infrastructure with encryption in transit and at rest, and is logically separated by tenant. We apply role-based access controls and audit logging. No system is perfectly secure, and we encourage you to use strong credentials and enable available account protections.",
  },
  {
    heading: "7. Data retention",
    body: "We retain account and business data for as long as your account is active. If you close your account, we retain data for a limited period to allow export or recovery, after which it is deleted or anonymized, except where retention is required by law.",
  },
  {
    heading: "8. Your rights",
    body: "Depending on your location, you may have rights to access, correct, export, or delete your personal data, and to object to certain processing. You can exercise these rights by contacting us using the details below; workspace administrators can also manage most data directly within the Service.",
  },
  {
    heading: "9. International transfers",
    body: "Your data may be processed in countries other than your own. Where required, we use appropriate safeguards for cross-border transfers.",
  },
  {
    heading: "10. Children's privacy",
    body: "The Service is intended for business use and is not directed to individuals under 18.",
  },
  {
    heading: "11. Changes to this policy",
    body: "We may update this Privacy Policy from time to time. Material changes will be communicated through the Service or by email before they take effect.",
  },
  {
    heading: "12. Contact",
    body: "Questions about this Privacy Policy can be sent to privacy@zimplifyed.ai.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: July 8, 2026</p>

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
        <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
          Terms of Service
        </Link>
        .
      </p>
    </div>
  );
}
