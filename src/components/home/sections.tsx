import { Container, SectionHeading, Button } from "@/components/ui";
import { modules, industries } from "@/lib/content";

/* ---------- Logos / trust strip ---------- */
export function TrustStrip() {
  return (
    <section className="border-b border-line bg-white py-10">
      <Container>
        <p className="text-center text-xs font-medium uppercase tracking-wider text-muted">
          Trusted by founders running real operations
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 opacity-60">
          {["NorthPort", "Veda Mills", "Acme Trade Co", "Lumen Exports", "Kraft & Co", "Meridian"].map(
            (name) => (
              <span key={name} className="text-base font-semibold text-ink-soft">
                {name}
              </span>
            )
          )}
        </div>
      </Container>
    </section>
  );
}

/* ---------- The problem ---------- */
export function Problem() {
  return (
    <section className="border-b border-line bg-surface py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="The problem"
              title="Founders waste months becoming software buyers"
              highlight="software buyers"
              sub="Choosing a CRM. Comparing ERP plans. Wiring payroll into accounting. Every tool speaks a different language and nothing reconciles. That's time you don't have."
            />
          </div>
          <div className="rounded-2xl border border-line bg-white p-8 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.22)]">
            <div className="flex flex-wrap gap-2">
              {["CRM", "Accounting", "Payroll", "Inventory", "HR", "Orders", "Procurement", "Reporting"].map(
                (t) => (
                  <span
                    key={t}
                    className="rounded-md border border-dashed border-line bg-surface px-3 py-1.5 text-sm text-muted"
                  >
                    {t}
                  </span>
                )
              )}
            </div>
            <div className="my-6 flex items-center gap-3 text-sm text-muted">
              <div className="h-px flex-1 bg-line" />
              becomes
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-4">
              <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-md text-sm font-bold text-white">
                S
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">One Zimplifyed suite</p>
                <p className="text-xs text-muted">Everything connected, out of the box.</p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- AI layer (the centerpiece) ---------- */
export function AILayer() {
  const items = [
    ["Just ask, it's done", "Onboard a vendor, raise a PO, run payroll — describe it and Zimplifyed executes across every module."],
    ["Auto data entry", "Drop in a PO or invoice — Zimplifyed reads it and fills the records in seconds."],
    ["Demand forecasting", "Predicts stock-outs and reorder timing from your real history."],
    ["Anomaly alerts", "Flags margin dips, late shipments and cash-flow risks early."],
  ];
  const flow = ["Quote", "Order", "Inventory", "Fulfilment", "Invoice", "Books"];

  return (
    <section className="relative overflow-hidden border-b border-line bg-white py-20 sm:py-28">
      <div className="glow-brand pointer-events-none absolute inset-x-0 top-0 h-64" aria-hidden />
      <Container className="relative">
        <SectionHeading
          center
          eyebrow="The AI in Zimplifyed"
          title="Your suite does the busywork for you"
          highlight="busywork"
          sub="An intelligence layer that spans every module — because it all lives in one place. Any complex action, completed in under two minutes."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([t, d]) => (
            <div
              key={t}
              className="rounded-2xl border border-line bg-surface/60 p-6 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_16px_40px_-24px_rgba(29,78,216,0.35)]"
            >
              <h3 className="text-base font-semibold text-ink">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>

        {/* Flow diagram */}
        <div className="mt-16 rounded-2xl border border-line bg-surface/50 p-8">
          <p className="text-center text-sm font-medium text-ink-soft">
            One action flows through every module — automatically
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {flow.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <div className="rounded-lg border border-line bg-white px-5 py-3 text-sm font-medium text-ink shadow-sm">
                  {step}
                </div>
                {i < flow.length - 1 && (
                  <span className="text-brand" aria-hidden>
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- The suite (modules grid) ---------- */
export function Suite() {
  return (
    <section id="platform" className="scroll-mt-20 border-b border-line bg-surface py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow="The platform"
          title="One suite. Every essential tool, AI-powered."
          highlight="AI-powered"
          sub="Best-in-class modules that share one database, one login and one design — so your data flows instead of getting re-keyed."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => (
            <div
              key={m.name}
              className="group rounded-2xl border border-line bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_16px_40px_-22px_rgba(29,78,216,0.35)]"
            >
              <div className="bg-brand-gradient flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white">
                {m.name.slice(0, 2)}
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink">{m.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{m.desc}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Industries / solutions ---------- */
export function Solutions() {
  return (
    <section id="solutions" className="scroll-mt-20 border-b border-line bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Solutions"
          title="Tuned for how your industry actually works"
          highlight="actually works"
          sub="Zimplifyed ships with the workflows, documents and compliance built for trade and manufacturing — not generic templates."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {industries.map((ind) => (
            <div
              key={ind.slug}
              className="rounded-2xl border border-line bg-white p-7 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_16px_40px_-26px_rgba(29,78,216,0.3)]"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                {ind.name}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink">{ind.headline}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{ind.blurb}</p>
              <ul className="mt-5 space-y-2">
                {ind.points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm text-ink-soft">
                    <span className="text-success">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Why Zimplifyed (comparison) ---------- */
export function Why() {
  const rows = [
    ["Time to set up", "Months of evaluation", "Days, guided by AI"],
    ["Integrations", "You build & maintain them", "Pre-integrated"],
    ["Data reconciliation", "Manual, error-prone", "Automatic"],
    ["Everyday actions", "Click through 12 tools", "Just ask, done in minutes"],
    ["Pricing", "12 invoices, surprise tiers", "One predictable price"],
    ["Vendor management", "12 support queues", "One partner"],
  ];
  return (
    <section id="why" className="scroll-mt-20 border-b border-line bg-surface py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow="Why Zimplifyed"
          title="Bundled beats stitching tools together"
          highlight="Bundled"
        />
        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-line bg-white">
          <div className="grid grid-cols-3 border-b border-line bg-surface text-sm font-semibold text-ink">
            <div className="p-4" />
            <div className="p-4 text-muted">DIY stack</div>
            <div className="p-4 text-gradient">Zimplifyed AI</div>
          </div>
          {rows.map(([label, diy, zimplifyed]) => (
            <div key={label} className="grid grid-cols-3 border-b border-line text-sm last:border-0">
              <div className="p-4 font-medium text-ink">{label}</div>
              <div className="p-4 text-muted">{diy}</div>
              <div className="bg-brand-soft/50 p-4 font-medium text-ink">{zimplifyed}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Security ---------- */
export function Security() {
  const items = [
    ["SOC 2 Type II", "Independently audited controls."],
    ["Role-based access", "Granular permissions and audit logs."],
    ["Data residency", "Choose where your data lives."],
    ["Encryption", "At rest and in transit, end to end."],
  ];
  return (
    <section id="security" className="scroll-mt-20 border-b border-line bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Enterprise trust"
          title="Security your customers and auditors expect"
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-surface/50 p-6">
              <h3 className="text-base font-semibold text-ink">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            </div>
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
          sub="No per-tool licensing, no surprise tiers. Everything included, scaling with your team."
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
            {["All modules — CRM to Payroll", "AI agent that runs any action", "Industry workflows for trade & manufacturing", "Onboarding & migration support", "Enterprise security & SSO"].map(
              (f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-success">✓</span>
                  {f}
                </li>
              )
            )}
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
          {/* Subtle brand aura on the dark bg */}
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
              Found your company the easy way
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">
              One AI-powered suite that runs export, import, trade and
              manufacturing. Describe what you need — Zimplifyed does the rest.
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
