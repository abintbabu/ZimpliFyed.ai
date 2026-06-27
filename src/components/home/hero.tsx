import { Container, Button, Eyebrow } from "@/components/ui";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-white">
      <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      <Container className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center animate-rise">
          <Eyebrow>
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Built for Export · Import · B2B Trade · Manufacturing
          </Eyebrow>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-6xl">
            The complete operating system for founders
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft sm:text-xl">
            Stop comparing tools, decoding pricing tiers and stitching software
            together. Simplifi bundles the best CRM, ERP, HRMS, Payroll, Orders
            and Inventory — pre-integrated, so you can just run your business.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/demo" className="px-6 py-3 text-base">
              Book a demo
            </Button>
            <Button href="/signup" variant="secondary" className="px-6 py-3 text-base">
              Get started free
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted">
            No credit card required · One suite, one price
          </p>
        </div>

        {/* Product window mock */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)]">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-line" />
              <span className="h-3 w-3 rounded-full bg-line" />
              <span className="h-3 w-3 rounded-full bg-line" />
              <span className="ml-4 text-xs font-medium text-muted">
                app.simplifi.ai · Dashboard
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 p-6 sm:grid-cols-4">
              {[
                ["Revenue", "$1.42M", "+12.4%"],
                ["Open Orders", "318", "+6 today"],
                ["In Production", "27", "4 due"],
                ["Receivables", "$284K", "12 invoices"],
              ].map(([label, value, meta]) => (
                <div
                  key={label}
                  className="rounded-lg border border-line bg-surface/50 p-4"
                >
                  <p className="text-xs font-medium text-muted">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
                  <p className="mt-1 text-xs text-success">{meta}</p>
                </div>
              ))}
              <div className="col-span-3 mt-2 flex h-32 items-end gap-2 rounded-lg border border-line bg-surface/50 p-4 sm:col-span-4">
                {[40, 65, 50, 80, 60, 95, 72, 88, 70, 100, 84, 92].map(
                  (h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-brand/80"
                      style={{ height: `${h}%` }}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
