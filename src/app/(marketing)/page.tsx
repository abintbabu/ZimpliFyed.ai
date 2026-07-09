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

export default function Home() {
  return (
    <>
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
