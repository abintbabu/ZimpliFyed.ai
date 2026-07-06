import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/google-button";

export const metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden bg-surface px-5 py-16">
      <div className="glow-brand pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-sm animate-rise">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="bg-brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white">
            S
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Welcome back
          </h1>
          <p className="text-sm text-muted">
            Sign in to your Simplifi AI workspace
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-8 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.22)]">
          <GoogleSignInButton label="Continue with Google" />

          <p className="mt-6 text-center text-xs text-muted">
            By signing in, you agree to our{" "}
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
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-brand hover:underline">
            Sign up free
          </Link>
        </p>
      </div>
    </main>
  );
}
