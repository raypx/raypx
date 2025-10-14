import { createFileRoute } from "@tanstack/react-router";
import { CtaSection } from "@/components/home/cta-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { TechStackSection } from "@/components/home/tech-stack-section";

function HomePage() {
  return (
    <div>
      <HeroSection />
      <FeaturesSection />
      <TechStackSection />
      <CtaSection />
    </div>
  );
}

export const Route = createFileRoute("/_home/")({
  component: HomePage,
});
