import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/google-button";

export const metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden bg-surface px-5 py-16">
      {/* Ambient aura */}
      <div className="glow-sunset pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-sm animate-rise">
        {/* Logo mark */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="bg-sunset flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white">
            S
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Found your company the{" "}
            <span className="text-gradient">easy way</span>
          </h1>
          <p className="text-sm text-muted">
            Get started free — no credit card required
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-line bg-white p-8 shadow-[0_24px_60px_-30px_rgba(20,18,16,0.28)]">
          {/* Value props */}
          <ul className="mb-6 space-y-2">
            {[
              "Every module free to explore",
              "AI assistant ready from day one",
              "No setup, no integrations, no IT",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-ink-soft">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/15 text-[10px] text-success">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>

          <GoogleSignInButton label="Sign up with Google" />

          <p className="mt-6 text-center text-xs text-muted">
            By creating an account, you agree to our{" "}
            <Link href="#" className="underline underline-offset-2 hover:text-ink">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="#" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-coral hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
