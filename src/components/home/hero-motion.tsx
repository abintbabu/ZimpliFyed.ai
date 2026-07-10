"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useInView,
} from "motion/react";
import { heroStory } from "@/lib/content";

/**
 * "Founder's day, compressed" — the hero motion graphic. Scene machine:
 * chaos chips pile up on the left, one ask appears, then the chaos is
 * absorbed — each chip collapses in place with a check as calm outcome
 * cards land on the right. Both panes stay populated at all times so the
 * before/after reads in a single glance, even mid-loop or in a screenshot.
 * Falls back to the composed payoff frame under reduced motion, and pauses
 * while offscreen.
 */

type Scene = "grind" | "ask" | "collapse" | "calm" | "hold";

const SCENE_MS: Record<Scene, number> = {
  grind: 2800,
  ask: 2200,
  collapse: 1600,
  calm: 4200,
  hold: 2600,
};

const NEXT: Record<Scene, Scene> = {
  grind: "ask",
  ask: "collapse",
  collapse: "calm",
  calm: "hold",
  hold: "grind",
};

// Which of the 3 story steps is lit: 0 = chaos, 1 = ask, 2 = done.
const STEP: Record<Scene, number> = {
  grind: 0,
  ask: 1,
  collapse: 1,
  calm: 2,
  hold: 2,
};

const STEP_LABELS = ["The grind", "One ask", "Done"] as const;

// Deterministic scatter for the chaos chips (no Math.random → SSR-safe).
const SCATTER = [-3, 2, -1.5, 2.5, -2, 1, -2.5, 1.5];

export function HeroMotion() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [scene, setScene] = useState<Scene>("grind");

  useEffect(() => {
    if (reduced || !inView) return;
    const t = setTimeout(() => setScene((s) => NEXT[s]), SCENE_MS[scene]);
    return () => clearTimeout(t);
  }, [scene, reduced, inView]);

  // Reduced motion: hold the composed payoff frame.
  const s: Scene = reduced ? "hold" : scene;
  const askVisible = s !== "grind";
  // Chips are being absorbed from "collapse" onward — struck through, then gone.
  const chipsResolving = s === "collapse" || s === "calm" || s === "hold";
  const calmVisible = s === "calm" || s === "hold";
  const activeStep = STEP[s];

  return (
    <div
      ref={ref}
      className="mx-auto mt-16 max-w-[72rem] animate-rise"
      style={{ animationDelay: "0.15s" }}
    >
      <p className="sr-only">
        One ask to Zimplifyed replaces a founder&apos;s full day of manual export
        work: quote ready, documents verified and payment tracked in under two
        minutes.
      </p>
      <div
        aria-hidden
        className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-slate-700" />
          <span className="h-3 w-3 rounded-full bg-slate-700" />
          <span className="h-3 w-3 rounded-full bg-slate-700" />
          <span className="ml-3 text-xs font-medium text-slate-400">
            app.zimplifyed.ai · Ask Zimplifyed
          </span>
          {/* Clock: the day compressed */}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold tabular-nums">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={calmVisible ? "after" : "before"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={calmVisible ? "text-emerald-400" : "text-slate-400"}
              >
                {calmVisible
                  ? `⏱ ${heroStory.after.elapsed}`
                  : `⏱ ${heroStory.before.clockStart} → ${heroStory.before.clockEnd}`}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>

        {/* Step indicator — gives the loop a visible beginning/middle/end */}
        <div className="flex items-center justify-center gap-2 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <motion.span
                animate={{
                  opacity: i <= activeStep ? 1 : 0.5,
                  scale: i === activeStep ? 1 : 0.9,
                }}
                transition={{ duration: 0.4 }}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                  i < activeStep
                    ? "text-emerald-400"
                    : i === activeStep
                      ? "text-blue-400"
                      : "text-slate-500"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                    i < activeStep
                      ? "bg-emerald-500/20 text-emerald-400"
                      : i === activeStep
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {i < activeStep ? "✓" : i + 1}
                </span>
                {label}
              </motion.span>
              {i < STEP_LABELS.length - 1 && (
                <span className="h-px w-6 bg-slate-700 sm:w-10" />
              )}
            </div>
          ))}
        </div>

        <div className="grid min-h-[510px] gap-4 p-5 sm:min-h-[540px] sm:grid-cols-2 sm:p-6">
          {/* Left pane — the grind */}
          <div className="relative flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">
                {heroStory.before.label}
              </p>
              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                12+ hrs manual
              </span>
            </div>
            <div className="mt-3 flex flex-wrap content-start gap-2">
              {heroStory.before.chaos.map((chip, i) => (
                <motion.span
                  key={chip}
                  initial={{ opacity: 0, y: 14, rotate: 0 }}
                  animate={{
                    opacity: chipsResolving ? 0.55 : 1,
                    y: 0,
                    rotate: chipsResolving ? 0 : SCATTER[i],
                    scale: chipsResolving ? 0.96 : 1,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                    delay: s === "grind" ? i * 0.1 : chipsResolving ? i * 0.05 : 0,
                  }}
                  className={`relative inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    chipsResolving
                      ? "border-emerald-500/30 bg-emerald-500/5 text-slate-400 line-through decoration-emerald-500/60"
                      : "border-slate-700 bg-slate-800 text-slate-200"
                  }`}
                >
                  <AnimatePresence>
                    {chipsResolving && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.05 + 0.1 }}
                        className="text-[10px] text-emerald-400 no-underline"
                      >
                        ✓
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {chip}
                </motion.span>
              ))}
            </div>

            {/* The ask — slides up over the chaos */}
            <AnimatePresence>
              {askVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ type: "spring", stiffness: 220, damping: 24 }}
                  className="mt-auto flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-800 p-3 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.8)]"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.15, 1] }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white"
                  >
                    Z
                  </motion.span>
                  <p className="text-xs leading-snug text-slate-100 sm:text-sm">
                    {heroStory.ask.split(" ").map((word, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 + i * 0.05 }}
                      >
                        {word}{" "}
                      </motion.span>
                    ))}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right pane — the calm */}
          <div
            className={`relative flex flex-col rounded-xl border p-4 transition-colors ${
              calmVisible
                ? "border-blue-500/40 bg-slate-900"
                : "border-slate-800 bg-slate-900/50"
            }`}
          >
            <div className="relative flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">
                {heroStory.after.label}
              </p>
              <AnimatePresence>
                {calmVisible && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"
                  >
                    ⏱ {heroStory.after.elapsed}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="relative mt-3 flex flex-1 flex-col justify-start gap-2.5">
              <AnimatePresence mode="wait">
                {calmVisible ? (
                  <motion.div
                    key="outcomes"
                    className="flex flex-col gap-2.5"
                  >
                    {heroStory.after.outcomes.map((o, i) => (
                      <motion.div
                        key={o.title}
                        initial={{ opacity: 0, y: 16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.3 } }}
                        transition={{
                          type: "spring",
                          stiffness: 240,
                          damping: 22,
                          delay: i * 0.35,
                        }}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-700 bg-slate-800 p-3"
                      >
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: [0, 1.2, 1] }}
                          transition={{ duration: 0.45, delay: i * 0.35 + 0.15 }}
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] text-emerald-400"
                        >
                          ✓
                        </motion.span>
                        <div>
                          <p className="text-sm font-semibold text-slate-100">
                            {o.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {o.detail}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="working"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
                  >
                    <span className="flex gap-1">
                      {[0, 0.2, 0.4].map((d) => (
                        <span
                          key={d}
                          className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-blue-400"
                          style={{ animationDelay: `${d}s` }}
                        />
                      ))}
                    </span>
                    <p className="text-[11px] font-medium text-slate-400">
                      {askVisible
                        ? "Reading the email, pricing the deal…"
                        : "Waiting for your ask"}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent caption — the animation illustrates this claim */}
      <p className="mx-auto mt-4 max-w-xl text-center text-sm text-muted">
        One ask replaces a day of export paperwork — quote, documents and
        payment tracking, done in{" "}
        <span className="font-semibold text-ink">under two minutes</span>.
      </p>
    </div>
  );
}
