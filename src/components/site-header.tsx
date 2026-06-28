import Link from "next/link";
import { Container, Button } from "@/components/ui";
import { navLinks } from "@/lib/content";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="bg-sunset flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white">
            S
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Simplifi<span className="text-gradient"> AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:block"
          >
            Log in
          </Link>
          <Button href="/signup" variant="gradient">Start free</Button>
        </div>
      </Container>
    </header>
  );
}
