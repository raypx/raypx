import { cn } from "@raypx/ui/lib/utils";
import {
  Bot,
  Database,
  Globe,
  LineChart,
  Lock,
  type LucideIcon,
  Palette,
  Rocket,
  Zap,
} from "lucide-react";
import Container from "~/components/layout/container";
import { SpotlightCard } from "./spotlight-card";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  accent?: string;
};

const features: Feature[] = [
  {
    icon: Bot,
    title: "AI-First Design",
    description:
      "Built from the ground up for AI applications, with native integration for LLMs and vector databases.",
    className: "col-span-2 md:col-span-2 md:row-span-2",
    accent: "#8b5cf6",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Powered by Vite and React 19 for instant HMR and optimal production performance.",
    className: "col-span-1 md:col-span-1",
    accent: "#eab308",
  },
  {
    icon: Lock,
    title: "Enterprise Security",
    description:
      "Bank-grade security with secure authentication, role-based access control, and data encryption.",
    className: "col-span-1 md:col-span-1",
    accent: "#22c55e",
  },
  {
    icon: Palette,
    title: "Modern UI/UX",
    description:
      "Beautiful, accessible components built with Tailwind CSS and Radix UI for a premium feel.",
    className: "col-span-1 md:col-span-1",
    accent: "#ec4899",
  },
  {
    icon: LineChart,
    title: "Deep Observability",
    description: "Integrated analytics, error tracking, and performance monitoring out of the box.",
    className: "col-span-1 md:col-span-1",
    accent: "#06b6d4",
  },
  {
    icon: Database,
    title: "Type-Safe Database",
    description:
      "End-to-end type safety with Drizzle ORM and tRPC for confident database operations.",
    className: "col-span-2 md:col-span-2",
    accent: "#3b82f6",
  },
  {
    icon: Globe,
    title: "Global Ready",
    description: "Built-in internationalization support to help you reach users worldwide.",
    className: "col-span-1 md:col-span-1",
    accent: "#14b8a6",
  },
  {
    icon: Rocket,
    title: "Easy Deployment",
    description:
      "Deploy anywhere with Docker support, or one-click deploy to Vercel, Cloudflare, or Railway.",
    className: "col-span-1 md:col-span-1",
    accent: "#f97316",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 md:py-32 bg-muted/30 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-linear-to-b from-background via-transparent to-background pointer-events-none z-10" />

      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-20 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl opacity-20 animate-pulse [animation-delay:1s]" />

      {/* Grid Pattern with enhanced visibility */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] pointer-events-none" />

      {/* Scan line effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.015]">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.1)_2px,rgba(255,255,255,0.1)_4px)]" />
      </div>

      <Container className="relative z-20">
        <div className="space-y-12 relative">
          {/* Section header */}
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-4">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              Core Features
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight bg-linear-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
              Everything you need
            </h2>
            <p className="text-lg text-muted-foreground">
              A complete toolkit for building modern, scalable web applications.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const isLarge = feature.className?.includes("row-span-2");
              return (
                <SpotlightCard
                  className={cn("group overflow-hidden", feature.className)}
                  key={index}
                  spotlightColor={`${feature.accent}30`}
                >
                  {/* Animated gradient background on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                    style={{
                      background: `radial-gradient(ellipse at 50% 0%, ${feature.accent}15 0%, transparent 70%)`,
                    }}
                  />

                  {/* Tech grid pattern */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                    <div
                      className="absolute inset-0 [background-size:20px_20px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)] opacity-30"
                      style={{
                        backgroundImage: `radial-gradient(${feature.accent}40 1px, transparent 1px)`,
                      }}
                    />
                  </div>

                  {/* Floating particles effect for large cards */}
                  {isLarge && (
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div
                        className="absolute w-1 h-1 rounded-full opacity-0 group-hover:opacity-60 animate-float-up"
                        style={{
                          background: feature.accent,
                          left: "20%",
                          animationDelay: "0s",
                        }}
                      />
                      <div
                        className="absolute w-1 h-1 rounded-full opacity-0 group-hover:opacity-60 animate-float-up"
                        style={{
                          background: feature.accent,
                          left: "50%",
                          animationDelay: "0.5s",
                        }}
                      />
                      <div
                        className="absolute w-1 h-1 rounded-full opacity-0 group-hover:opacity-60 animate-float-up"
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
                      "p-6 md:p-8 h-full flex flex-col relative z-10",
                      isLarge && "p-8 md:p-10",
                    )}
                  >
                    {/* Icon with glow effect */}
                    <div className="relative mb-6">
                      {/* Glow behind icon */}
                      <div
                        className="absolute inset-0 rounded-2xl blur-xl opacity-0 group-hover:opacity-60 transition-opacity duration-500 scale-150"
                        style={{ background: feature.accent }}
                      />
                      <div
                        className={cn(
                          "relative size-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                          "bg-gradient-to-br from-white/10 to-white/5 dark:from-white/10 dark:to-white/5",
                          "ring-1 ring-white/10 group-hover:ring-white/20",
                          "group-hover:scale-110 group-hover:rotate-3",
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
                          style={{ color: feature.accent }}
                        />
                      </div>
                    </div>

                    {/* Title with gradient on hover */}
                    <h3
                      className={cn(
                        "font-semibold mb-3 transition-all duration-300",
                        isLarge ? "text-2xl" : "text-xl",
                      )}
                    >
                      <span className="bg-linear-to-r from-foreground to-foreground bg-clip-text group-hover:from-foreground group-hover:to-foreground/70 transition-all duration-300">
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
                      <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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
