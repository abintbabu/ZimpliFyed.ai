import { Container, SectionHeading, Button } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { aiCapabilities, suiteGroups, personas, onboarding } from "@/lib/content";

/* ---------- The problem ---------- */
export function Problem() {
  const pains = [
    "Chasing vendor rates across WhatsApp and email",
    "Re-keying the same data into 8 disconnected tools",
    "Document mismatches that trigger customs holds",
    "Missed LUT / RCMC renewals and unclaimed RoDTEP",
  ];
  return (
    <section className="border-b border-line bg-surface py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="The problem"
              title="Exporters run on spreadsheets, WhatsApp and a CHA's memory"
              highlight="spreadsheets, WhatsApp"
              sub="The paperwork is unforgiving, the tools don't talk to each other, and one mismatched field holds a container at the port. That's margin and time a small firm can't spare."
            />
          </div>
          <div className="rounded-2xl border border-line bg-white p-8 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.22)]">
            <ul className="space-y-3">
              {pains.map((p, i) => (
                <Reveal as="li" key={p} delay={i * 80}>
                  <span className="flex items-start gap-3 text-sm text-ink-soft">
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-line text-[11px] text-muted">
                      ✕
                    </span>
                    {p}
                  </span>
                </Reveal>
              ))}
            </ul>
            <div className="my-6 flex items-center gap-3 text-sm text-muted">
              <div className="h-px flex-1 bg-line" />
              becomes
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-4">
              <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-md text-sm font-bold text-white">
                Z
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">One Zimplifyed suite</p>
                <p className="text-xs text-muted">
                  One source of truth, from RFQ to receivable.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- AI layer (the moat) ---------- */
export function AILayer() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-white py-20 sm:py-28">
      <div className="glow-brand pointer-events-none absolute inset-x-0 top-0 h-64" aria-hidden />
      <Container className="relative">
        <SectionHeading
          center
          eyebrow="The AI in Zimplifyed"
          title="The expert work, done for you"
          highlight="expert work"
          sub="HS codes, document drafting, LC review, consistency checks — the jobs that usually need a CHA on staff. Any complex action, completed in under two minutes."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {aiCapabilities.map((c, i) => (
            <Reveal key={c.name} delay={i * 90}>
              <div className="h-full rounded-2xl border border-line bg-surface/60 p-6 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_16px_40px_-24px_rgba(29,78,216,0.35)]">
                <h3 className="text-base font-semibold text-ink">{c.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{c.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- The suite (modules grouped by journey) ---------- */
export function Suite() {
  return (
    <section
      id="platform"
      className="scroll-mt-20 border-b border-line bg-surface py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          center
          eyebrow="The platform"
          title="Enterprise depth, SMB simplicity"
          highlight="Enterprise depth"
          sub="Every module a growing exporter needs, sharing one database, one login and one design — organised around how the work actually flows."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suiteGroups.map((g, i) => (
            <Reveal key={g.group} delay={i * 80}>
              <div className="h-full rounded-2xl border border-line bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_16px_40px_-22px_rgba(29,78,216,0.35)]">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                  {g.group}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {g.modules.map((m) => (
                    <li key={m} className="flex items-center gap-2 text-sm text-ink-soft">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand/60" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Personas ---------- */
export function Solutions() {
  return (
    <section id="solutions" className="scroll-mt-20 border-b border-line bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Who it's for"
          title="Built for every seat in a small export firm"
          highlight="every seat"
          sub="From the founder watching cash to the ops manager fighting paperwork — the same suite, tuned to each person's job."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {personas.map((p, i) => (
            <Reveal key={p.slug} delay={i * 80}>
              <div className="h-full rounded-2xl border border-line bg-white p-7 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_16px_40px_-26px_rgba(29,78,216,0.3)]">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                  {p.name}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-ink">{p.headline}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{p.blurb}</p>
                <ul className="mt-5 space-y-2">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-center gap-2 text-sm text-ink-soft">
                      <span className="text-success">✓</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Why Zimplifyed (comparison) ---------- */
export function Why() {
  const rows = [
    ["Time to first quote", "Weeks of tool setup", "Live in days, guided by AI"],
    ["Export documents", "Manually typed, error-prone", "Auto-filled & consistency-checked"],
    ["HS codes & duties", "Ask a CHA, wait", "AI-classified with RoDTEP rate"],
    ["Vendor sourcing", "WhatsApp threads", "RFQ portal & landed-cost compare"],
    ["Compliance deadlines", "Remembered, or missed", "Tracked with expiry alerts"],
    ["Incentives (RoDTEP)", "Often left unclaimed", "Calculated and tracked per order"],
  ];
  return (
    <section id="why" className="scroll-mt-20 border-b border-line bg-surface py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow="Why Zimplifyed"
          title="One suite beats a drawer full of tools"
          highlight="One suite"
        />
        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-line bg-white">
          <div className="grid grid-cols-3 border-b border-line bg-surface text-sm font-semibold text-ink">
            <div className="p-4" />
            <div className="p-4 text-muted">The usual way</div>
            <div className="p-4 text-gradient">Zimplifyed AI</div>
          </div>
          {rows.map(([label, old, z]) => (
            <div key={label} className="grid grid-cols-3 border-b border-line text-sm last:border-0">
              <div className="p-4 font-medium text-ink">{label}</div>
              <div className="p-4 text-muted">{old}</div>
              <div className="bg-brand-soft/50 p-4 font-medium text-ink">{z}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Onboarding: week one ---------- */
export function Onboarding() {
  return (
    <section className="border-b border-line bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow="Getting started"
          title="Live in your first week"
          highlight="first week"
          sub="No months-long implementation. Zimplifyed reads your existing documents and stands up your export operation stage by stage."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {onboarding.map((o, i) => (
            <Reveal key={o.day} delay={i * 90}>
              <div className="relative h-full rounded-2xl border border-line bg-surface/60 p-6">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                  {o.day}
                </span>
                <h3 className="mt-3 text-base font-semibold text-ink">{o.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{o.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Security ---------- */
export function Security() {
  const items = [
    ["Role-based access", "Granular permissions and full audit logs on every record."],
    ["Encryption", "Encrypted at rest and in transit, end to end."],
    ["Tenant isolation", "Multi-tenant by design — your data is walled off, always."],
    ["Built for SOC 2", "Controls designed to the SOC 2 framework as we scale."],
  ];
  return (
    <section id="security" className="scroll-mt-20 border-b border-line bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Enterprise trust"
          title="Security your buyers and auditors expect"
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([t, d], i) => (
            <Reveal key={t} delay={i * 80}>
              <div className="h-full rounded-2xl border border-line bg-surface/50 p-6">
                <h3 className="text-base font-semibold text-ink">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Pricing ---------- */
export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-b border-line bg-surface py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow="Pricing"
          title="One suite. One price."
          highlight="One price."
          sub="No per-tool licensing, no surprise tiers. Every module included, scaling with your team."
        />
        <div className="border-gradient mx-auto mt-12 max-w-md rounded-2xl p-8 shadow-[0_30px_70px_-35px_rgba(29,78,216,0.45)]">
          <p className="text-sm font-semibold text-gradient">Zimplifyed Suite</p>
          <p className="mt-3 text-4xl font-semibold text-ink">
            $—<span className="text-base font-normal text-muted"> /seat / month</span>
          </p>
          <p className="mt-2 text-sm text-muted">
            Every module included. Volume pricing for teams.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-ink-soft">
            {[
              "Full journey — discovery to incentives",
              "AI agent that runs any action",
              "20+ export documents, consistency-checked",
              "Compliance vault & deadline alerts",
              "Onboarding & migration support",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-success">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <Button href="/demo" variant="gradient" className="mt-8 w-full py-3 text-base">
            Talk to sales
          </Button>
        </div>
      </Container>
    </section>
  );
}

/* ---------- Final CTA ---------- */
export function FinalCTA() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-ink px-8 py-16 text-center sm:px-16">
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(29,78,216,0.35), transparent 70%)",
            }}
            aria-hidden
          />
          <div className="bg-grid absolute inset-0 opacity-10" aria-hidden />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Run your export business the easy way
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">
              One AI-first suite for the whole journey — buyer to booking to
              payment. Describe what you need; Zimplifyed does the expert work.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                href="/signup"
                className="bg-white px-6 py-3 text-base text-ink hover:bg-white/90"
              >
                Start free
              </Button>
              <Button
                href="/demo"
                className="border border-white/30 bg-transparent px-6 py-3 text-base text-white hover:bg-white/10"
              >
                Book a demo
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
