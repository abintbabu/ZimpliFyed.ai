"use client";

import { useEffect, useReducer } from "react";
import { heroDemo } from "@/lib/content";

/**
 * The hero demo, animated as a loop: the buyer prompt appears, the AI works
 * through its steps one at a time, then the result card slides in and the
 * whole thing resets. Falls back to the fully-revealed final frame when the
 * user prefers reduced motion.
 */

const TOTAL = heroDemo.steps.length;

type State = { phase: "working" | "done"; revealed: number };

function reducer(s: State): State {
  if (s.phase === "working") {
    if (s.revealed < TOTAL) return { ...s, revealed: s.revealed + 1 };
    return { phase: "done", revealed: TOTAL };
  }
  return { phase: "working", revealed: 0 };
}

export function ChatMock() {
  const [state, tick] = useReducer(reducer, { phase: "working", revealed: 0 });

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      // Jump straight to the completed frame and hold.
      return;
    }
    // Pace: quick between steps, a longer beat to admire the result.
    const delay = state.phase === "done" ? 3200 : 900;
    const t = setTimeout(tick, delay);
    return () => clearTimeout(t);
  }, [state]);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const revealed = reduced ? TOTAL : state.revealed;
  const done = reduced ? true : state.phase === "done";

  return (
    <div
      className="mx-auto mt-16 max-w-3xl animate-rise"
      style={{ animationDelay: "0.15s" }}
    >
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_70px_-35px_rgba(15,23,42,0.35)]">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-line" />
          <span className="h-3 w-3 rounded-full bg-line" />
          <span className="h-3 w-3 rounded-full bg-line" />
          <span className="ml-3 text-xs font-medium text-muted">
            app.zimplifyed.ai · Ask Zimplifyed
          </span>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {/* Buyer prompt */}
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm text-white">
              {heroDemo.prompt}
            </p>
          </div>

          {/* AI working */}
          <div className="flex items-start gap-3">
            <span className="bg-brand-gradient mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white">
              Z
            </span>
            <div className="w-full max-w-[85%] rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3">
              <p className="flex items-center gap-2 text-xs font-medium text-muted">
                {!done && (
                  <span className="flex gap-1" aria-hidden>
                    <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-brand" />
                    <span
                      className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-brand"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <span
                      className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-brand"
                      style={{ animationDelay: "0.4s" }}
                    />
                  </span>
                )}
                {done
                  ? "Completed across 4 modules"
                  : "Working across 4 modules"}
              </p>
              <ul className="mt-3 space-y-2">
                {heroDemo.steps.slice(0, revealed).map((step) => (
                  <li
                    key={step}
                    className="animate-stepin flex items-center gap-2 text-sm text-ink-soft"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/15 text-[10px] text-success">
                      ✓
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Result action card */}
          <div
            className="border-gradient flex flex-col gap-3 rounded-xl p-4 transition-all duration-500 sm:flex-row sm:items-center sm:justify-between"
            style={{
              opacity: done ? 1 : 0,
              transform: done ? "none" : "translateY(8px)",
            }}
          >
            <div>
              <p className="text-sm font-semibold text-ink">
                {heroDemo.result.title}
              </p>
              <p className="mt-1 text-xs text-muted">{heroDemo.result.detail}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {heroDemo.result.time}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
