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
};

const features: Feature[] = [
  {
    icon: Bot,
    title: "AI-First Design",
    description:
      "Built from the ground up for AI applications, with native integration for LLMs and vector databases.",
    className: "md:col-span-2 md:row-span-2",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Powered by Vite and React 19 for instant HMR and optimal production performance.",
    className: "md:col-span-1",
  },
  {
    icon: Lock,
    title: "Enterprise Security",
    description:
      "Bank-grade security with secure authentication, role-based access control, and data encryption.",
    className: "md:col-span-1",
  },
  {
    icon: Palette,
    title: "Modern UI/UX",
    description:
      "Beautiful, accessible components built with Tailwind CSS and Radix UI for a premium feel.",
    className: "md:col-span-1",
  },
  {
    icon: LineChart,
    title: "Deep Observability",
    description: "Integrated analytics, error tracking, and performance monitoring out of the box.",
    className: "md:col-span-1",
  },
  {
    icon: Database,
    title: "Type-Safe Database",
    description:
      "End-to-end type safety with Drizzle ORM and tRPC for confident database operations.",
    className: "md:col-span-2",
  },
  {
    icon: Globe,
    title: "Global Ready",
    description: "Built-in internationalization support to help you reach users worldwide.",
    className: "md:col-span-1",
  },
  {
    icon: Rocket,
    title: "Easy Deployment",
    description:
      "Deploy anywhere with Docker support, or one-click deploy to Vercel, Cloudflare, or Railway.",
    className: "md:col-span-1",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 md:py-32 bg-muted/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-b from-background via-transparent to-background pointer-events-none z-10" />
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <Container className="relative z-20">
        <div className="space-y-12 relative">
          {/* Section header */}
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              Everything you need
            </h2>
            <p className="text-lg text-muted-foreground">
              A complete toolkit for building modern, scalable web applications.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <SpotlightCard
                  className={cn("group overflow-hidden bg-card/50", feature.className)}
                  key={index}
                >
                  {/* Dot Pattern inside card */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(var(--primary)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black,transparent)] opacity-20" />
                  </div>

                  <div className="p-8 h-full flex flex-col relative z-10">
                    <div className="mb-6 size-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300 shadow-sm group-hover:shadow-primary/20 ring-1 ring-primary/10 group-hover:ring-primary/30">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {feature.description}
                    </p>
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
