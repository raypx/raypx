import { HomeLayout } from "@fumadocs/base-ui/layouts/home";
import type { TablerIcon } from "@raypx/ui/components/icon";
import { Icon } from "@raypx/ui/components/icon";
import {
  IconBrandGithub,
  IconCode,
  IconDatabase,
  IconFile,
  IconGitBranch,
  IconMapPin,
  IconPackage,
  IconPaint,
  IconRocket,
  IconShield,
  IconSparkles,
} from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ParticleBackground } from "~/components/particles";
import { baseOptions } from "../lib/layout.shared";

export const Route = createFileRoute("/")({
  component: () => <RouteComponent />,
});

type Feature = {
  icon: TablerIcon;
  title: string;
  description: string;
};

type TechStack = {
  icon: TablerIcon;
  category: string;
  items: string[];
};

const features: Feature[] = [
  {
    icon: IconMapPin,
    title: "Lightning Fast",
    description:
      "Built with TanStack Start, Vite 7, and React 19 for unparalleled performance and developer experience.",
  },
  {
    icon: IconShield,
    title: "Enterprise Security",
    description:
      "Better Auth with OAuth, 2FA, session management, and enterprise-grade security features out of the box.",
  },
  {
    icon: IconPaint,
    title: "Modern UI/UX",
    description:
      "60+ shadcn/ui components with Radix UI primitives and Tailwind CSS v4 for beautiful, accessible interfaces.",
  },
  {
    icon: IconCode,
    title: "Type-Safe APIs",
    description:
      "End-to-end type safety with ORPC, ensuring your frontend and backend always stay in sync.",
  },
  {
    icon: IconDatabase,
    title: "Powerful ORM",
    description:
      "Drizzle ORM with PostgreSQL for a type-safe, performant, and developer-friendly database layer.",
  },
  {
    icon: IconSparkles,
    title: "AI-Ready",
    description:
      "Built-in support for OpenAI and DeepSeek integration for building intelligent applications.",
  },
];

const techStack: TechStack[] = [
  {
    icon: IconFile,
    category: "Framework",
    items: ["TanStack Start 1.135", "React 19", "TypeScript 5.9", "Vite 7"],
  },
  {
    icon: IconCode,
    category: "Backend",
    items: ["Better Auth", "Drizzle ORM", "ORPC", "PostgreSQL"],
  },
  {
    icon: IconPaint,
    category: "UI & Styling",
    items: ["Tailwind CSS v4", "Radix UI", "shadcn/ui", "60+ Components"],
  },
  {
    icon: IconPackage,
    category: "Monorepo",
    items: ["bun 10+", "Turborepo", "14 Packages", "Workspace Protocol"],
  },
  {
    icon: IconGitBranch,
    category: "Deploy",
    items: ["Netlify", "Cloudflare", "Self-hosted"],
  },
];

function RouteComponent() {
  const options = baseOptions();
  return (
    <>
      <ParticleBackground />
      <HomeLayout {...options}>
        <main className="container mx-auto px-4 py-16">
          {/* Hero Section */}
          <div className="mx-auto max-w-5xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 via-emerald-500/10 to-cyan-500/10 px-5 py-2 font-medium text-primary text-sm shadow-sm backdrop-blur-sm">
              <IconSparkles className="size-4" />
              <span className="bg-gradient-to-r from-primary to-emerald-600 bg-clip-text font-semibold">
                Production-Ready Platform
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="mb-8 font-bold text-6xl tracking-tight sm:text-7xl md:text-8xl lg:text-9xl">
              Build Modern
              <br />
              <span className="bg-gradient-to-r from-primary via-emerald-500 to-cyan-500 bg-clip-text text-transparent">
                AI-Powered Apps
              </span>
            </h1>

            {/* Description */}
            <p className="mx-auto mb-10 max-w-3xl text-muted-foreground text-xl leading-relaxed sm:text-2xl">
              A high-performance full-stack platform built with{" "}
              <span className="font-semibold text-foreground">TanStack Start</span> and{" "}
              <span className="font-semibold text-foreground">React 19</span>, designed for building
              scalable applications with enterprise-grade security and uncompromising type safety.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-xl bg-primary px-10 font-semibold text-base text-primary-foreground shadow-primary/25 shadow-xl transition-all hover:scale-105 hover:shadow-2xl hover:shadow-primary/30 active:scale-95"
                params={{
                  _splat: "",
                }}
                to="/docs/$"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Get Started
                  <IconRocket className="size-5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
              <a
                className="group inline-flex h-14 items-center justify-center gap-3 rounded-xl border-2 border-border/50 bg-gradient-to-br from-background to-muted/50 px-10 font-semibold text-base shadow-lg backdrop-blur-sm transition-all hover:scale-105 hover:border-primary/30 hover:bg-gradient-to-br hover:from-primary/5 hover:to-emerald-500/5 hover:shadow-primary/10 hover:shadow-xl active:scale-95"
                href="https://github.com/raypx/raypx"
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconBrandGithub className="size-6 transition-transform group-hover:scale-110" />
                <span>View on GitHub</span>
              </a>
            </div>

            {/* Stats */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-muted-foreground">
              <span className="flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 font-medium text-sm">
                <div className="size-2.5 animate-pulse rounded-full bg-green-500 shadow-green-500/50 shadow-sm" />
                Apache 2.0 License
              </span>
              <span className="flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 font-medium text-sm">
                <IconCode className="size-4 text-primary" />
                TypeScript First
              </span>
              <span className="flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 font-medium text-sm">
                <IconPackage className="size-4 text-emerald-500" />
                14 Packages
              </span>
              <span className="flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 font-medium text-sm">
                <IconPaint className="size-4 text-cyan-500" />
                60+ Components
              </span>
            </div>
          </div>

          {/* Features Section */}
          <div className="mx-auto mt-40 max-w-7xl">
            <div className="mb-16 text-center">
              <h2 className="mb-6 font-bold text-5xl tracking-tight sm:text-6xl">
                Everything You Need
                <br />
                <span className="bg-gradient-to-r from-foreground to-foreground/50 bg-clip-text">
                  To Build Fast
                </span>
              </h2>
              <p className="mx-auto max-w-3xl text-muted-foreground text-xl leading-relaxed">
                A comprehensive full-stack platform with all the tools and features you need to
                build production-ready applications quickly and efficiently.
              </p>
            </div>

            {/* Bento Grid Layout */}
            <div className="grid gap-6 md:grid-cols-3 md:grid-rows-2">
              {/* Large card - spans 2 columns and 2 rows */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/20 p-10 shadow-xl transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl md:col-span-2 md:row-span-2">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative">
                  <div className="mb-8 inline-flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-primary/30 text-primary shadow-xl transition-all duration-500 group-hover:scale-110 group-hover:shadow-2xl group-hover:shadow-primary/20">
                    {features[0]?.icon && <Icon className="size-10" icon={features[0].icon} />}
                  </div>
                  <h3 className="mb-4 font-bold text-4xl tracking-tight">{features[0]?.title}</h3>
                  <p className="text-muted-foreground text-xl leading-relaxed">
                    {features[0]?.description}
                  </p>
                </div>
              </div>

              {/* Medium card */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/20 p-8 shadow-xl transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative">
                  <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 text-primary shadow-lg transition-all duration-500 group-hover:scale-110">
                    {features[1]?.icon && <Icon className="size-8" icon={features[1].icon} />}
                  </div>
                  <h3 className="mb-3 font-bold text-2xl tracking-tight">{features[1]?.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {features[1]?.description}
                  </p>
                </div>
              </div>

              {/* Medium card */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/20 p-8 shadow-xl transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative">
                  <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 text-primary shadow-lg transition-all duration-500 group-hover:scale-110">
                    {features[2]?.icon && <Icon className="size-8" icon={features[2].icon} />}
                  </div>
                  <h3 className="mb-3 font-bold text-2xl tracking-tight">{features[2]?.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {features[2]?.description}
                  </p>
                </div>
              </div>

              {/* Wide card - spans 2 columns */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/20 p-8 shadow-xl transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl md:col-span-2">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative flex flex-col items-start gap-6 sm:flex-row">
                  <div className="inline-flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 text-primary shadow-lg transition-all duration-500 group-hover:scale-110">
                    {features[3]?.icon && <Icon className="size-8" icon={features[3].icon} />}
                  </div>
                  <div>
                    <h3 className="mb-3 font-bold text-2xl tracking-tight">{features[3]?.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {features[3]?.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Regular card */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/20 p-8 shadow-xl transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative">
                  <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 text-primary shadow-lg transition-all duration-500 group-hover:scale-110">
                    {features[4]?.icon && <Icon className="size-8" icon={features[4].icon} />}
                  </div>
                  <h3 className="mb-3 font-bold text-2xl tracking-tight">{features[4]?.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {features[4]?.description}
                  </p>
                </div>
              </div>

              {/* Regular card */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/20 p-8 shadow-xl transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative">
                  <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 text-primary shadow-lg transition-all duration-500 group-hover:scale-110">
                    {features[5]?.icon && <Icon className="size-8" icon={features[5].icon} />}
                  </div>
                  <h3 className="mb-3 font-bold text-2xl tracking-tight">{features[5]?.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {features[5]?.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tech Stack Section */}
          <div className="mx-auto mt-40 max-w-7xl">
            <div className="mb-16 text-center">
              <h2 className="mb-6 font-bold text-5xl tracking-tight sm:text-6xl">
                Powered by Modern
                <br />
                <span className="bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text">
                  Tech Stack
                </span>
              </h2>
              <p className="mx-auto max-w-3xl text-muted-foreground text-xl leading-relaxed">
                Built with the latest and greatest tools from the React ecosystem and beyond for
                optimal performance and developer experience.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {techStack.map((stack, index) => (
                <div
                  className="group rounded-2xl border border-border/50 bg-gradient-to-br from-card to-muted/10 p-7 shadow-lg backdrop-blur-sm transition-all hover:border-primary/40 hover:shadow-primary/5 hover:shadow-xl"
                  key={index}
                >
                  <div className="mb-5 flex items-center gap-4">
                    <div className="inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/30 text-primary shadow-md transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/20">
                      <Icon className="size-5" icon={stack.icon} />
                    </div>
                    <h3 className="font-bold text-xl">{stack.category}</h3>
                  </div>
                  <ul className="space-y-3">
                    {stack.items.map((item, itemIndex) => (
                      <li
                        className="flex items-center gap-3 font-medium text-base text-mutedforeground transition-all hover:translate-x-2 hover:text-foreground"
                        key={itemIndex}
                      >
                        <div className="size-2 rounded-full bg-primary shadow-sm transition-all group-hover:scale-125" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="mx-auto mt-40 max-w-5xl rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-emerald-500/10 to-cyan-500/10 p-16 text-center shadow-2xl backdrop-blur-sm">
            {/* Decorative gradient orbs */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl">
              <div className="absolute -top-24 -left-24 size-48 rounded-full bg-gradient-to-br from-primary/30 to-emerald-500/30 blur-3xl" />
              <div className="absolute -right-24 -bottom-24 size-48 rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 blur-3xl" />
            </div>

            <div className="relative">
              <h2 className="mb-6 font-bold text-5xl tracking-tight sm:text-6xl">
                Ready to Build
                <br />
                <span className="bg-gradient-to-r from-primary via-emerald-500 to-cyan-500 bg-clip-text">
                  Something Amazing?
                </span>
              </h2>
              <p className="mx-auto mb-10 max-w-2xl text-muted-foreground text-xl leading-relaxed">
                Get started with Raypx today and experience the power of modern full-stack
                development with unparalleled performance and developer experience.
              </p>
              <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
                <Link
                  className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-emerald-600 px-12 font-bold text-base text-primary-foreground shadow-2xl shadow-primary/25 transition-all hover:scale-110 hover:shadow-3xl hover:shadow-primary/30 active:scale-95"
                  params={{
                    _splat: "",
                  }}
                  to="/docs/$"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Read Documentation
                    <IconRocket className="size-5 transition-transform group-hover:translate-x-1 group-hover:rotate-12" />
                  </span>
                </Link>
                <a
                  className="group inline-flex h-14 items-center justify-center gap-3 rounded-2xl border-2 border-border/50 bg-background/50 px-12 font-bold text-base shadow-xl backdrop-blur-sm transition-all hover:scale-110 hover:border-primary/40 hover:bg-gradient-to-br hover:from-primary/10 hover:to-emerald-500/10 hover:shadow-2xl hover:shadow-primary/10 active:scale-95"
                  href="https://github.com/raypx/raypx"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <IconBrandGithub className="size-6 transition-transform group-hover:rotate-12 group-hover:scale-125" />
                  <span>Star on GitHub</span>
                </a>
              </div>
            </div>
          </div>
        </main>
      </HomeLayout>
    </>
  );
}
