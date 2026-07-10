import Link from "next/link";

export const metadata = {
  title: "Check your email",
};

export default function CheckEmailPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden bg-surface px-5 py-16">
      <div className="glow-brand pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-sm animate-rise text-center">
        <span className="bg-brand-gradient mx-auto mb-6 flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white">
          S
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Check your email
        </h1>
        <p className="mt-3 text-sm text-muted">
          We sent you a sign-in link. Click it to continue — it expires in 24 hours.
        </p>
        <p className="mt-8 text-sm text-muted">
          <Link href="/login" className="font-medium text-brand hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
