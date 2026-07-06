import { Hero } from "@/components/home/hero";
import {
  TrustStrip,
  Problem,
  AILayer,
  Suite,
  Solutions,
  Why,
  Security,
  Pricing,
  FinalCTA,
} from "@/components/home/sections";

export default function Home() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <Problem />
      <AILayer />
      <Suite />
      <Solutions />
      <Why />
      <Security />
      <Pricing />
      <FinalCTA />
    </>
  );
}
