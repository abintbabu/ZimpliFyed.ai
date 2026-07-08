import { Container, Button, Eyebrow } from "@/components/ui";
import { heroDemo } from "@/lib/content";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-white">
      {/* Subtle indigo aura */}
      <div className="glow-brand pointer-events-none absolute inset-0" aria-hidden />
      {/* Floating orbs — cool indigo/sky tones */}
      <div
        className="animate-float pointer-events-none absolute -left-24 top-8 h-80 w-80 rounded-full bg-brand/8 blur-3xl"
        aria-hidden
      />
      <div
        className="animate-float pointer-events-none absolute -right-20 top-32 h-96 w-96 rounded-full bg-sky/8 blur-3xl"
        style={{ animationDelay: "3s" }}
        aria-hidden
      />

      <Container className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center animate-rise">
          <Eyebrow>
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            The AI-first operating system for founders
          </Eyebrow>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-6xl">
            Run your entire company by{" "}
            <span className="text-gradient">simply asking</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft sm:text-xl">
            CRM, ERP, HR, Payroll, Orders, Inventory — one pre-integrated suite
            where every app is AI-powered. Chat with Zimplifyed and it completes any
            complex action in under two minutes.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/signup" variant="gradient" className="px-6 py-3 text-base">
              Start free
            </Button>
            <Button href="/demo" variant="secondary" className="px-6 py-3 text-base">
              Watch it work
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted">
            No credit card required · One suite, one price
          </p>
        </div>

        <ChatMock />
      </Container>
    </section>
  );
}

function ChatMock() {
  return (
    <div className="mx-auto mt-16 max-w-3xl animate-rise" style={{ animationDelay: "0.15s" }}>
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
          {/* User prompt */}
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm text-white">
              {heroDemo.prompt}
            </p>
          </div>

          {/* AI working */}
          <div className="flex items-start gap-3">
            <span className="bg-brand-gradient mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white">
              S
            </span>
            <div className="w-full max-w-[85%] rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3">
              <p className="flex items-center gap-2 text-xs font-medium text-muted">
                <span className="flex gap-1" aria-hidden>
                  <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-brand" />
                  <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-brand" style={{ animationDelay: "0.2s" }} />
                  <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-brand" style={{ animationDelay: "0.4s" }} />
                </span>
                Working across 4 modules
              </p>
              <ul className="mt-3 space-y-2">
                {heroDemo.steps.map((step) => (
                  <li key={step} className="flex items-center gap-2 text-sm text-ink-soft">
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
          <div className="border-gradient flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">{heroDemo.result.title}</p>
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
