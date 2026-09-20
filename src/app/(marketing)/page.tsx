import { Hero } from "@/components/home/hero";
import { Stats } from "@/components/home/stats";
import { JourneyPipeline } from "@/components/home/journey-pipeline";
import { DocumentMock } from "@/components/home/document-mock";
import { FAQ } from "@/components/home/faq";
import {
  Problem,
  AILayer,
  Suite,
  Solutions,
  Why,
  Onboarding,
  Security,
  Pricing,
  FinalCTA,
} from "@/components/home/sections";
import { faqs } from "@/lib/content";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, jsonLd } from "@/lib/site";

export const metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR", description: "Free plan" },
  publisher: { "@id": `${SITE_URL}/#organization` },
};

// Mirrors the FAQ section rendered below; keep the two in sync by reading the same `faqs` source.
const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd([softwareLd, faqLd])} />
      <Hero />
      <Stats />
      <Problem />
      <AILayer />
      <JourneyPipeline />
      <DocumentMock />
      <Suite />
      <Solutions />
      <Why />
      <Onboarding />
      <Security />
      <Pricing />
      <FAQ />
      <FinalCTA />
    </>
  );
}
