import { createFileRoute } from "@tanstack/react-router";
import { CtaSection } from "@/components/home/cta-section";
import { HeroSection } from "@/components/home/hero-section";
import { TechStackSection } from "@/components/home/tech-stack-section";

function HomePage() {
  return (
    <div>
      <HeroSection />
      <TechStackSection />
      <CtaSection />
    </div>
  );
}

export const Route = createFileRoute("/_home/")({
  component: HomePage,
});
