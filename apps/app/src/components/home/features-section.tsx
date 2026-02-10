import type { TablerIcon } from "@raypx/ui/components/icon";
import { Icon } from "@raypx/ui/components/icon";
import { cn } from "@raypx/ui/lib/utils";
import {
  IconBolt,
  IconDatabase,
  IconGlobe,
  IconPaint,
  IconRobot,
  IconRocket,
  IconSearch,
  IconShield,
} from "@tabler/icons-react";
import Container from "~/components/layout/container";
import { SpotlightCard } from "./spotlight-card";

type Feature = {
  icon: TablerIcon;
  title: string;
  description: string;
  className?: string;
  accent?: string;
};

const features: Feature[] = [
  {
    icon: IconRobot,
    title: "AI-First Design",
    description:
      "Built from the ground up for AI applications, with native integration for LLMs and vector databases.",
    className: "col-span-2 md:col-span-2 md:row-span-2",
    accent: "#8b5cf6",
  },
  {
    icon: IconBolt,
    title: "Lightning Fast",
    description: "Powered by Vite and React 19 for instant HMR and optimal production performance.",
    className: "col-span-1 md:col-span-1",
    accent: "#eab308",
  },
  {
    icon: IconShield,
    title: "Enterprise Security",
    description:
      "Bank-grade security with secure authentication, role-based access control, and data encryption.",
    className: "col-span-1 md:col-span-1",
    accent: "#22c55e",
  },
  {
    icon: IconPaint,
    title: "Modern UI/UX",
    description:
      "Beautiful, accessible components built with Tailwind CSS and Radix UI for a premium feel.",
    className: "col-span-1 md:col-span-1",
    accent: "#ec4899",
  },
  {
    icon: IconSearch,
    title: "Deep Observability",
    description: "Integrated analytics, error tracking, and performance monitoring out of the box.",
    className: "col-span-1 md:col-span-1",
    accent: "#06b6d4",
  },
  {
    icon: IconDatabase,
    title: "Type-Safe Database",
    description:
      "End-to-end type safety with Drizzle ORM and ORPC for confident database operations.",
    className: "col-span-2 md:col-span-2",
    accent: "#3b82f6",
  },
  {
    icon: IconGlobe,
    title: "Global Ready",
    description: "Built-in internationalization support to help you reach users worldwide.",
    className: "col-span-1 md:col-span-1",
    accent: "#14b8a6",
  },
  {
    icon: IconRocket,
    title: "Easy Deployment",
    description:
      "Deploy anywhere with Docker support, or one-click deploy to Cloudflare or Railway.",
    className: "col-span-1 md:col-span-1",
    accent: "#f97316",
  },
];

export function FeaturesSection() {
  return (
    <section className="relative overflow-hidden bg-muted/30 py-20 md:py-32">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-linear-to-b from-background via-transparent to-background" />

      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 animate-pulse rounded-full bg-primary/20 opacity-20 blur-3xl" />
      <div className="absolute right-1/4 bottom-1/4 h-96 w-96 animate-pulse rounded-full bg-blue-500/20 opacity-20 blur-3xl [animation-delay:1s]" />

      {/* Grid Pattern with enhanced visibility */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px]" />

      {/* Scan line effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.015]">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.1)_2px,rgba(255,255,255,0.1)_4px)]" />
      </div>

      <Container className="relative z-20">
        <div className="relative space-y-12">
          {/* Section header */}
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 font-medium text-primary text-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Core Features
            </div>
            <h2 className="bg-linear-to-r from-foreground via-foreground to-foreground/70 bg-clip-text font-bold text-3xl tracking-tight md:text-4xl lg:text-5xl">
              Everything you need
            </h2>
            <p className="text-lg text-muted-foreground">
              A complete toolkit for building modern, scalable web applications.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid auto-rows-[minmax(180px,auto)] grid-cols-2 gap-4 md:grid-cols-4">
            {features.map((feature, index) => {
              const isLarge = feature.className?.includes("row-span-2");
              return (
                <SpotlightCard
                  className={cn("group overflow-hidden", feature.className)}
                  key={index}
                  spotlightColor={cn(`${feature.accent}30`)}
                >
                  {/* Animated gradient background on hover */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(ellipse at 50% 0%, ${feature.accent}15 0%, transparent 70%)`,
                    }}
                  />

                  {/* Tech grid pattern */}
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                    <div
                      className="absolute inset-0 opacity-30 [background-size:20px_20px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]"
                      style={{
                        backgroundImage: `radial-gradient(${feature.accent}40 1px, transparent 1px)`,
                      }}
                    />
                  </div>

                  {/* Floating particles effect for large cards */}
                  {isLarge && (
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                      <div
                        className="absolute h-1 w-1 animate-float-up rounded-full opacity-0 group-hover:opacity-60"
                        style={{
                          background: feature.accent,
                          left: "20%",
                          animationDelay: "0s",
                        }}
                      />
                      <div
                        className="absolute h-1 w-1 animate-float-up rounded-full opacity-0 group-hover:opacity-60"
                        style={{
                          background: feature.accent,
                          left: "50%",
                          animationDelay: "0.5s",
                        }}
                      />
                      <div
                        className="absolute h-1 w-1 animate-float-up rounded-full opacity-0 group-hover:opacity-60"
                        style={{
                          background: feature.accent,
                          left: "80%",
                          animationDelay: "1s",
                        }}
                      />
                    </div>
                  )}

                  <div
                    className={cn(
                      "relative z-10 flex h-full flex-col p-6 md:p-8",
                      isLarge && "p-8 md:p-10",
                    )}
                  >
                    {/* Icon with glow effect */}
                    <div className="relative mb-6">
                      {/* Glow behind icon */}
                      <div
                        className="absolute inset-0 scale-150 rounded-2xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-60"
                        style={{ background: feature.accent }}
                      />
                      <div
                        className={cn(
                          "relative flex size-12 items-center justify-center rounded-2xl transition-all duration-500",
                          "bg-linear-to-br from-white/10 to-white/5 dark:from-white/10 dark:to-white/5",
                          "ring-1 ring-white/10 group-hover:ring-white/20",
                          "group-hover:rotate-3 group-hover:scale-110",
                          isLarge && "size-14",
                        )}
                        style={{
                          boxShadow: `0 0 0 1px ${feature.accent}20, inset 0 1px 1px rgba(255,255,255,0.1)`,
                        }}
                      >
                        <Icon
                          className={cn(
                            "size-6 transition-all duration-500 group-hover:drop-shadow-[0_0_8px_currentColor]",
                            isLarge && "size-7",
                          )}
                          icon={feature.icon}
                          style={{ color: feature.accent }}
                        />
                      </div>
                    </div>

                    {/* Title with gradient on hover */}
                    <h3
                      className={cn(
                        "mb-3 font-semibold transition-all duration-300",
                        isLarge ? "text-2xl" : "text-xl",
                      )}
                    >
                      <span className="bg-linear-to-r from-foreground to-foreground bg-clip-text transition-all duration-300 group-hover:from-foreground group-hover:to-foreground/70">
                        {feature.title}
                      </span>
                    </h3>

                    {/* Description */}
                    <p
                      className={cn(
                        "text-muted-foreground leading-relaxed",
                        isLarge ? "text-base" : "text-sm",
                      )}
                    >
                      {feature.description}
                    </p>

                    {/* Decorative line */}
                    <div className="mt-auto pt-6">
                      <div className="h-px w-full bg-linear-to-r from-transparent via-border to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
