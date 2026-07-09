"use client";

import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/ui";
import { proofStats } from "@/lib/content";

/**
 * Proof strip — concrete capability stats instead of fictional customer logos.
 * Numeric values count up once when scrolled into view.
 */
export function Stats() {
  return (
    <section className="border-b border-line bg-white py-12">
      <Container>
        <p className="text-center text-xs font-medium uppercase tracking-wider text-muted">
          Built for the way Indian export actually works
        </p>
        <dl className="mt-8 grid grid-cols-2 gap-8 lg:grid-cols-4">
          {proofStats.map((s) => (
            <div key={s.label} className="text-center">
              <dt className="text-3xl font-semibold tracking-tight text-gradient sm:text-4xl">
                <CountValue value={s.value} />
              </dt>
              <dd className="mt-2 text-sm leading-snug text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function CountValue({ value }: { value: string }) {
  const match = /^(\d+)(.*)$/.exec(value);
  const target = match ? Number(match[1]) : 0;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ref = useRef<HTMLSpanElement | null>(null);
  const [n, setN] = useState(match ? (reduced ? target : 0) : null);

  useEffect(() => {
    if (!match || reduced) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        const dur = 900;
        const start = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(target * eased));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // Intentionally mount-once: the observer disconnects itself after firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!match) return <span>{value}</span>;
  return (
    <span ref={ref}>
      {n}
      {match[2]}
    </span>
  );
}
