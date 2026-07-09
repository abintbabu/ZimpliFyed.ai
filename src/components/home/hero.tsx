import { Container, Button, Eyebrow } from "@/components/ui";
import { ChatMock } from "@/components/home/chat-mock";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-white">
      {/* Subtle indigo aura */}
      <div className="glow-brand pointer-events-none absolute inset-0" aria-hidden />
      {/* Ambient gradient beam — cool, slow, enterprise */}
      <div
        className="animate-beam pointer-events-none absolute -inset-x-24 top-10 h-72 blur-3xl"
        aria-hidden
      />
      <div
        className="animate-float pointer-events-none absolute -right-20 top-40 h-96 w-96 rounded-full bg-sky/8 blur-3xl"
        style={{ animationDelay: "3s" }}
        aria-hidden
      />

      <Container className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center animate-rise">
          <Eyebrow>
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            The AI-first operating system for Indian exporters
          </Eyebrow>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-6xl">
            Run your entire export business by{" "}
            <span className="text-gradient">simply asking</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft sm:text-xl">
            Buyer discovery, quoting, vendor sourcing, production, shipping
            documents, tracking and incentives — one AI-first suite that runs the
            whole journey. Describe what you need; Zimplifyed does the expert work.
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
            No credit card required · Built for Indian export compliance
          </p>
        </div>

        <ChatMock />
      </Container>
    </section>
  );
}
