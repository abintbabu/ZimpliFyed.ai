import { Hero } from "@/components/home/hero";
import {
  TrustStrip,
  Problem,
  Suite,
  Connected,
  Solutions,
  Why,
  AILayer,
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
      <Suite />
      <Connected />
      <Solutions />
      <Why />
      <AILayer />
      <Security />
      <Pricing />
      <FinalCTA />
    </>
  );
}
