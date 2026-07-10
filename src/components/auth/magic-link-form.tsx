"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const result = await signIn("resend", { email, redirect: false });
    setStatus(result?.error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-center text-sm text-ink">
        Check your inbox for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        autoComplete="email"
        required
        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand/40"
      />
      {status === "error" && (
        <p className="text-xs text-red-600">
          Couldn&apos;t send the link. Please try again in a few minutes.
        </p>
      )}
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-xl border border-line bg-white px-5 py-3 text-sm font-medium text-ink transition-all hover:-translate-y-0.5 hover:border-brand/25 active:translate-y-0 disabled:opacity-60"
      >
        {status === "loading" ? "Sending..." : "Email me a sign-in link"}
      </button>
    </form>
  );
}
