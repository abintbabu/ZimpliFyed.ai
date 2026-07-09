import { Container, SectionHeading } from "@/components/ui";
import { Reveal } from "@/components/reveal";

const fields = [
  ["Exporter", "Veda Mills Pvt Ltd · IEC 0712345678"],
  ["Consignee", "Lumen Home GmbH · Hamburg, DE"],
  ["HS code", "6302.60 · Cotton toilet & kitchen linen"],
  ["Quantity", "5,000 pcs · 200 cartons · 4,120 kg"],
  ["Incoterm", "FOB Mundra · USD 10,700.00"],
  ["Vessel / port", "MV Nordic · INMUN → DEHAM"],
];

const checks = ["Commercial invoice", "Packing list", "Shipping bill", "Certificate of origin"];

/**
 * Static-but-animated document mock: fields sit in a "generated" invoice while
 * a consistency-check sweep passes over it and a badge confirms the set agrees.
 */
export function DocumentMock() {
  return (
    <section className="border-b border-line bg-surface py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Ship & comply"
              title="Documents that can't contradict each other"
              highlight="can't contradict"
              sub="The #1 cause of customs holds and LC rejections is a mismatch between documents. Zimplifyed fills all 20+ from one source of order data, then checks every field across the set before it ships."
            />
            <ul className="mt-8 space-y-3">
              {checks.map((c, i) => (
                <Reveal as="li" key={c} delay={i * 90}>
                  <span className="flex items-center gap-3 text-sm text-ink-soft">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-[11px] text-success">
                      ✓
                    </span>
                    {c} · consistent
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>

          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.28)]">
              {/* Consistency-check sweep */}
              <div
                className="animate-sweep pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand/12 to-transparent"
                aria-hidden
              />
              <div className="flex items-center justify-between border-b border-line pb-4">
                <p className="text-sm font-semibold text-ink">Commercial Invoice</p>
                <span className="text-xs font-medium text-muted">CI-2041</span>
              </div>
              <dl className="mt-4 space-y-3">
                {fields.map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                      {k}
                    </dt>
                    <dd className="text-sm text-ink sm:text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-[11px] text-success">
                  ✓
                </span>
                <p className="text-xs font-medium text-ink-soft">
                  AI checked · consistent across 4 documents
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
