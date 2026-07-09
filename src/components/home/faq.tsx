"use client";

import { useState } from "react";
import { Container, SectionHeading } from "@/components/ui";
import { faqs } from "@/lib/content";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="border-b border-line bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow="Questions"
          title="What exporters ask us first"
          highlight="exporters"
        />
        <div className="mx-auto mt-12 max-w-2xl divide-y divide-line rounded-2xl border border-line bg-white">
          {faqs.map((f, i) => {
            const on = open === i;
            return (
              <div key={f.q}>
                <button
                  type="button"
                  onClick={() => setOpen(on ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={on}
                >
                  <span className="text-sm font-semibold text-ink">{f.q}</span>
                  <span
                    className="shrink-0 text-lg text-brand transition-transform duration-300"
                    style={{ transform: on ? "rotate(45deg)" : "none" }}
                    aria-hidden
                  >
                    +
                  </span>
                </button>
                <div
                  className="grid overflow-hidden px-6 transition-all duration-300 ease-out"
                  style={{
                    gridTemplateRows: on ? "1fr" : "0fr",
                    opacity: on ? 1 : 0,
                    paddingBottom: on ? "1.25rem" : 0,
                  }}
                >
                  <p className="min-h-0 text-sm leading-relaxed text-muted">{f.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
