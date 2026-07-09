"use client";

import { useState } from "react";
import { Container, SectionHeading } from "@/components/ui";
import { journey } from "@/lib/content";

/**
 * Interactive horizontal pipeline of the seven exporter stages. A shipment
 * dot travels the rail continuously; clicking a stage swaps the detail panel.
 */
export function JourneyPipeline() {
  const [active, setActive] = useState(1); // default to "Quote"
  const current = journey[active];

  return (
    <section
      id="journey"
      className="scroll-mt-20 border-b border-line bg-white py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          center
          eyebrow="The journey"
          title="One thread from buyer discovery to money in the bank"
          highlight="buyer discovery to money"
          sub="Every stage feeds the next — no re-keying between disconnected tools. Follow a shipment through the whole export lifecycle."
        />

        {/* Rail */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="absolute left-0 right-0 top-4 h-px bg-line" aria-hidden />
          <div
            className="animate-travel absolute top-4 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_0_4px_rgba(29,78,216,0.15)]"
            aria-hidden
          />
          <ol className="relative flex justify-between gap-1">
            {journey.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.stage} className="flex min-w-0 flex-1 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    className="group flex flex-col items-center focus:outline-none"
                    aria-pressed={on}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all ${
                        on
                          ? "border-transparent bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(29,78,216,0.7)]"
                          : "border-line bg-white text-muted group-hover:border-brand/40 group-hover:text-ink"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`mt-3 text-center text-[11px] font-medium sm:text-xs ${
                        on ? "text-ink" : "text-muted"
                      }`}
                    >
                      {s.stage}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Detail panel */}
        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-line bg-surface/60 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">
            Stage {active + 1} · {current.stage}
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-ink">{current.title}</h3>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted">
            {current.desc}
          </p>
        </div>
      </Container>
    </section>
  );
}
