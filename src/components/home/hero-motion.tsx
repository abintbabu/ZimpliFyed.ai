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
 * chaos chips pile up on the left, one ask appears, the chaos vacuums away
 * and calm outcome cards land on the right, then the loop resets. Falls back
 * to the fully-composed final frame when the user prefers reduced motion,
 * and pauses while offscreen.
 */

type Scene = "grind" | "ask" | "collapse" | "calm" | "hold";

const SCENE_MS: Record<Scene, number> = {
  grind: 3000,
  ask: 2200,
  collapse: 2400,
  calm: 3600,
  hold: 2400,
};

const NEXT: Record<Scene, Scene> = {
  grind: "ask",
  ask: "collapse",
  collapse: "calm",
  calm: "hold",
  hold: "grind",
};

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
  const chaosVisible = s === "grind" || s === "ask";
  const askVisible = s !== "grind";
  const calmVisible = s === "calm" || s === "hold";

  return (
    <div
      ref={ref}
      className="mx-auto mt-16 max-w-3xl animate-rise"
      style={{ animationDelay: "0.15s" }}
    >
      <p className="sr-only">
        One ask to Zimplifyed replaces a founder&apos;s full day of manual export
        work: quote ready, documents verified and payment tracked in under two
        minutes.
      </p>
      <div
        aria-hidden
        className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_70px_-35px_rgba(15,23,42,0.35)]"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-line" />
          <span className="h-3 w-3 rounded-full bg-line" />
          <span className="h-3 w-3 rounded-full bg-line" />
          <span className="ml-3 text-xs font-medium text-muted">
            app.zimplifyed.ai · Ask Zimplifyed
          </span>
          {/* Clock: the day compressed */}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tabular-nums">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={calmVisible ? "after" : "before"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={calmVisible ? "text-success" : "text-muted"}
              >
                {calmVisible
                  ? `⏱ ${heroStory.after.elapsed}`
                  : `⏱ ${heroStory.before.clockStart} → ${heroStory.before.clockEnd}`}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>

        <div className="grid min-h-[340px] gap-4 p-5 sm:min-h-[360px] sm:grid-cols-2 sm:p-6">
          {/* Left pane — the grind */}
          <div className="relative flex flex-col rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-medium text-muted">
              {heroStory.before.label}
            </p>
            <motion.div
              className="mt-3 flex flex-wrap content-start gap-2"
              animate={{ opacity: chaosVisible ? 1 : 0.35 }}
              transition={{ duration: 0.8 }}
            >
              <AnimatePresence>
                {chaosVisible &&
                  heroStory.before.chaos.map((chip, i) => (
                    <motion.span
                      key={chip}
                      initial={{ opacity: 0, y: 14, rotate: 0 }}
                      animate={{ opacity: 1, y: 0, rotate: SCATTER[i] }}
                      exit={{
                        opacity: 0,
                        scale: 0.5,
                        x: 60,
                        y: 30,
                        transition: { duration: 0.5, delay: i * 0.06 },
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 20,
                        delay: s === "grind" ? i * 0.12 : 0,
                      }}
                      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink-soft shadow-sm"
                    >
                      {chip}
                    </motion.span>
                  ))}
              </AnimatePresence>
            </motion.div>

            {/* The ask — slides up over the chaos */}
            <AnimatePresence>
              {askVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ type: "spring", stiffness: 220, damping: 24 }}
                  className="mt-auto flex items-center gap-2.5 rounded-xl border border-line bg-white p-3 shadow-md"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.15, 1] }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="bg-brand-gradient flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  >
                    Z
                  </motion.span>
                  <p className="text-xs leading-snug text-ink sm:text-sm">
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
          <div className="relative flex flex-col rounded-xl border border-line bg-white p-4">
            {calmVisible && (
              <div className="glow-brand pointer-events-none absolute inset-0 rounded-xl opacity-60" />
            )}
            <p className="relative text-xs font-medium text-muted">
              {heroStory.after.label}
            </p>
            <div className="relative mt-3 flex flex-1 flex-col justify-start gap-2.5">
              <AnimatePresence>
                {calmVisible ? (
                  heroStory.after.outcomes.map((o, i) => (
                    <motion.div
                      key={o.title}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.3 } }}
                      transition={{
                        type: "spring",
                        stiffness: 240,
                        damping: 22,
                        delay: i * 0.4,
                      }}
                      className="flex items-start gap-2.5 rounded-xl border border-line bg-white p-3 shadow-sm"
                    >
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.2, 1] }}
                        transition={{ duration: 0.45, delay: i * 0.4 + 0.15 }}
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-[11px] text-success"
                      >
                        ✓
                      </motion.span>
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {o.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{o.detail}</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <motion.div
                    key="waiting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-1 items-center justify-center"
                  >
                    <span className="flex gap-1">
                      {[0, 0.2, 0.4].map((d) => (
                        <span
                          key={d}
                          className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-brand"
                          style={{ animationDelay: `${d}s` }}
                        />
                      ))}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
