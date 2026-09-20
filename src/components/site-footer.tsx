import Link from "next/link";
import { Container } from "@/components/ui";
import { CONTACT_EMAIL } from "@/lib/site";

// Only link to pages that exist — a dead "#" link wastes crawl budget and reads as an unfinished site.
const cols = [
  {
    title: "Platform",
    links: [
      { label: "How it works", href: "/#journey" },
      { label: "Platform", href: "/#platform" },
      { label: "Solutions", href: "/#solutions" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { label: "HS code finder", href: "/tools/hs-finder" },
      { label: "Landed cost calculator", href: "/tools/landed-cost" },
      { label: "LC discrepancy checker", href: "/tools/lc-checker" },
      { label: "All tools", href: "/tools" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Security", href: "/security" },
      { label: "Book a demo", href: "/demo" },
      { label: "Contact", href: `mailto:${CONTACT_EMAIL}` },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Start free", href: "/signup" },
      { label: "Log in", href: "/login" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="py-16">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-brand-gradient flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white">
                S
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink">
                Zimplifyed<span className="text-brand"> AI</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              The Export &amp; Import OS for Indian businesses — from buyer
              inquiry to payment, in one secure platform.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-ink">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line pt-8 text-sm text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Zimplifyed AI. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/security" className="hover:text-ink">
              Security
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
