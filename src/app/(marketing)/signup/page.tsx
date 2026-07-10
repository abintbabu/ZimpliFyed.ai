import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/google-button";
import { MagicLinkForm } from "@/components/auth/magic-link-form";

export const metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden bg-surface px-5 py-16">
      <div className="glow-brand pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-sm animate-rise">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="bg-brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white">
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

        <div className="rounded-2xl border border-line bg-white p-8 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.22)]">
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

          {Boolean(process.env.RESEND_API_KEY) && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>

              <MagicLinkForm />
            </>
          )}

          <p className="mt-6 text-center text-xs text-muted">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
