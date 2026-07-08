"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function CredentialsSignInForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setError("Invalid username or password.");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        autoComplete="username"
        required
        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand/40"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        required
        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand/40"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-brand-gradient w-full rounded-xl px-5 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
