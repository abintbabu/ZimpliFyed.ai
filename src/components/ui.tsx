import Link from "next/link";
import type { ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  href,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "gradient";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] px-5 py-2.5 text-sm font-medium transition-all duration-200";
  const styles =
    variant === "gradient"
      ? "bg-sunset text-white shadow-[0_10px_30px_-10px_rgba(255,94,126,0.7)] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgba(255,94,126,0.8)]"
      : variant === "primary"
        ? "bg-brand text-white shadow-[0_8px_24px_-12px_rgba(255,94,126,0.8)] hover:bg-brand-dark hover:-translate-y-0.5"
        : "border border-line bg-white text-ink hover:bg-surface hover:border-coral/40";
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-coral/20 bg-brand-soft px-3 py-1 text-xs font-medium text-ink-soft">
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  highlight,
  sub,
  center = false,
}: {
  eyebrow?: string;
  title: string;
  /** Optional substring of `title` rendered with the sunset gradient. */
  highlight?: string;
  sub?: string;
  center?: boolean;
}) {
  const renderTitle = () => {
    if (!highlight || !title.includes(highlight)) return title;
    const [before, after] = title.split(highlight);
    return (
      <>
        {before}
        <span className="text-gradient">{highlight}</span>
        {after}
      </>
    );
  };

  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {renderTitle()}
      </h2>
      {sub && <p className="mt-4 text-lg leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}
