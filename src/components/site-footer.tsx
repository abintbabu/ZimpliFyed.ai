import Link from "next/link";
import { Container } from "@/components/ui";

const cols = [
  {
    title: "Product",
    links: ["CRM", "ERP", "Orders", "Inventory", "HRMS", "Payroll"],
  },
  {
    title: "Solutions",
    links: ["Export", "Import", "B2B Trade", "Manufacturing"],
  },
  {
    title: "Company",
    links: ["About", "Customers", "Security", "Contact"],
  },
  {
    title: "Resources",
    links: ["Blog", "Guides", "ROI Calculator", "Integrations"],
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
                Simplifi<span className="text-brand"> AI</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              The complete operating system for founders. Every essential tool,
              pre-integrated and best-in-class.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-ink">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l}>
                    <Link
                      href="#"
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line pt-8 text-sm text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Simplifi AI. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="#" className="hover:text-ink">
              Terms
            </Link>
            <Link href="#" className="hover:text-ink">
              Status
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
