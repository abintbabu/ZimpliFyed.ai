import { Container, Button, SectionHeading } from "@/components/ui";

export default function DemoPage() {
  return (
    <section className="border-b border-line bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow="Demo"
          title="See Zimplifyed run a shipment end to end"
          highlight="end to end"
          sub="Tell us about your export operation and we'll walk you through quoting, sourcing, documents and tracking on a live shipment."
        />
        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-line bg-surface/60 p-8 text-center">
          <p className="text-sm text-muted">
            Demo booking isn&apos;t wired up yet — in the meantime, reach out
            directly and we&apos;ll get one on the calendar.
          </p>
          <Button
            href="mailto:hello@zimplifyed.ai"
            variant="gradient"
            className="mt-6 w-full py-3 text-base"
          >
            Email hello@zimplifyed.ai
          </Button>
        </div>
      </Container>
    </section>
  );
}
