import Link from "next/link";

export const metadata = {
  title: "Terms of Service",
};

const sections = [
  {
    heading: "1. Agreement to terms",
    body: "These Terms of Service (\"Terms\") govern your access to and use of Zimplifyed.ai (\"Zimplifyed\", \"we\", \"us\", or \"our\"), including our website, dashboard, and related services (collectively, the \"Service\"). By creating an account or using the Service, you agree to be bound by these Terms. If you are using the Service on behalf of a company, you represent that you have authority to bind that company.",
  },
  {
    heading: "2. The Service",
    body: "Zimplifyed provides software to help exporters and trading businesses manage buyers, quotes, orders, invoices, shipments, and related trade documentation, including AI-assisted features. We may add, change, or remove features at any time.",
  },
  {
    heading: "3. Accounts and eligibility",
    body: "You must provide accurate information when creating an account and keep your login credentials secure. You are responsible for all activity under your account. You must be authorized to act for your organization and comply with applicable export, import, and trade laws.",
  },
  {
    heading: "4. Your data",
    body: "You retain ownership of the business data you upload or create in the Service (\"Customer Data\"). You grant us a license to host, process, and display Customer Data solely to provide and improve the Service. You are responsible for the accuracy and legality of Customer Data you submit, including data relating to your buyers, vendors, and shipments.",
  },
  {
    heading: "5. AI-assisted features",
    body: "Some features use AI models to draft content, suggest values, or summarize information. AI output may be inaccurate or incomplete. You are responsible for reviewing and verifying any AI-generated content — including quotes, invoices, and trade documents — before relying on it or sending it to a third party.",
  },
  {
    heading: "6. Fees",
    body: "Certain plans or features may require payment. Fees, billing terms, and any trial or free-tier limits will be presented to you before you incur charges. Fees are non-refundable except as required by law.",
  },
  {
    heading: "7. Acceptable use",
    body: "You agree not to misuse the Service, including by attempting to access other tenants' data, reverse-engineering the Service, interfering with its operation, or using it for unlawful trade activity.",
  },
  {
    heading: "8. Termination",
    body: "You may stop using the Service and close your account at any time. We may suspend or terminate access if you materially breach these Terms. Upon termination, we will make Customer Data available for export for a reasonable period, then may delete it.",
  },
  {
    heading: "9. Disclaimers and limitation of liability",
    body: "The Service is provided \"as is\" without warranties of any kind. To the maximum extent permitted by law, Zimplifyed is not liable for indirect, incidental, or consequential damages, or for losses arising from reliance on AI-generated content or third-party carrier, banking, or customs data.",
  },
  {
    heading: "10. Changes to these Terms",
    body: "We may update these Terms from time to time. If we make material changes, we will provide reasonable notice (such as an in-app or email notice) before the changes take effect.",
  },
  {
    heading: "11. Contact",
    body: "Questions about these Terms can be sent to legal@zimplifyed.ai.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Terms of Service</h1>
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
        <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
