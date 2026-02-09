import { createFileRoute } from "@tanstack/react-router";
import { CtaSection } from "~/components/home/cta-section";
import { FeaturesSection } from "~/components/home/features-section";
import { HeroSection } from "~/components/home/hero-section";
import { TechStackSection } from "~/components/home/tech-stack-section";
import { Layout } from "~/layouts/home";

function HomePage() {
  return (
    <Layout>
      <HeroSection />
      <TechStackSection />
      <FeaturesSection />
      <CtaSection />
    </Layout>
  );
}

export const Route = createFileRoute("/_home/")({
  component: HomePage,
});
