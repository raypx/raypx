import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import {
  Code2,
  Database,
  FileCode,
  GitBranch,
  Github,
  LayoutTemplate,
  Package,
  Palette,
  Rocket,
  Shield,
  Sparkles,
  TestTube,
  Zap,
} from "lucide-react";
import { baseOptions } from "../lib/layout.shared";

export const Route = createFileRoute("/")({
  component: () => <RouteComponent />,
});

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description:
      "Built with TanStack Start, Vite 7, and React 19 for unparalleled performance and developer experience.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description:
      "Better Auth with OAuth, 2FA, session management, and enterprise-grade security features out of the box.",
  },
  {
    icon: Palette,
    title: "Modern UI/UX",
    description:
      "60+ shadcn/ui components with Radix UI primitives and Tailwind CSS v4 for beautiful, accessible interfaces.",
  },
  {
    icon: Code2,
    title: "Type-Safe APIs",
    description:
      "End-to-end type safety with tRPC, ensuring your frontend and backend always stay in sync.",
  },
  {
    icon: Database,
    title: "Powerful ORM",
    description:
      "Drizzle ORM with PostgreSQL for a type-safe, performant, and developer-friendly database layer.",
  },
  {
    icon: Sparkles,
    title: "AI-Ready",
    description:
      "Built-in support for OpenAI and DeepSeek integration for building intelligent applications.",
  },
];

const techStack = [
  {
    icon: LayoutTemplate,
    category: "Framework",
    items: ["TanStack Start 1.135", "React 19", "TypeScript 5.9", "Vite 7"],
  },
  {
    icon: FileCode,
    category: "Backend",
    items: ["Better Auth", "Drizzle ORM", "tRPC", "PostgreSQL"],
  },
  {
    icon: Palette,
    category: "UI & Styling",
    items: ["Tailwind CSS v4", "Radix UI", "shadcn/ui", "60+ Components"],
  },
  {
    icon: Package,
    category: "Monorepo",
    items: ["pnpm 10+", "Turborepo", "14 Packages", "Workspace Protocol"],
  },
  {
    icon: TestTube,
    category: "Dev Tools",
    items: ["Biome", "Vitest", "Drizzle Kit", "Lefthook"],
  },
  {
    icon: GitBranch,
    category: "Deploy",
    items: ["Netlify", "Vercel", "Cloudflare", "Self-hosted"],
  },
];

function RouteComponent() {
  const options = baseOptions();
  return (
    <HomeLayout
      {...options}
      links={[
        {
          url: "/docs",
          text: "Docs",
        },
      ]}
      nav={{ ...options.nav }}
    >
      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="mx-auto max-w-4xl text-center animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary animate-in fade-in zoom-in-95 duration-700 delay-150">
            <Rocket className="size-4" />
            Production-Ready Full-Stack Platform
          </div>

          <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl animate-in fade-in slide-in-from-bottom-3 duration-1000 delay-300">
            Build Modern AI-Powered
            <br />
            <span className="bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Web Applications
            </span>
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-500">
            A high-performance full-stack platform built with TanStack Start and React 19, designed
            for building scalable applications with enterprise-grade security and uncompromising
            type safety.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row animate-in fade-in zoom-in-95 duration-700 delay-700">
            <Link
              className="group inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 hover:shadow-lg hover:scale-105"
              params={{
                _splat: "",
              }}
              to="/docs/$"
            >
              Get Started
            </Link>
            <a
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:scale-105"
              href="https://github.com/raypx/raypx"
              rel="noopener noreferrer"
              target="_blank"
            >
              <Github className="size-5 transition-transform group-hover:rotate-12" />
              <span>View on GitHub</span>
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground animate-in fade-in duration-1000 delay-1000">
            <span className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-green-500 animate-pulse" />
              Apache 2.0 License
            </span>
            <span>•</span>
            <span>TypeScript First</span>
            <span>•</span>
            <span>14 Packages</span>
            <span>•</span>
            <span>60+ Components</span>
          </div>
        </div>

        {/* Features Section */}
        <div className="mx-auto mt-32 max-w-6xl">
          <div className="mb-12 text-center animate-in fade-in slide-in-from-bottom-3 duration-1000">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything You Need to Build Fast
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              A comprehensive full-stack platform with all the tools and features you need to build
              production-ready applications.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <div
                className="group relative rounded-lg border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4 duration-700"
                key={index}
                style={{
                  animationDelay: `${(index + 1) * 100}ms`,
                }}
              >
                <div className="mb-4 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110 group-hover:rotate-3">
                  <feature.icon className="size-6" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Stack Section */}
        <div className="mx-auto mt-32 max-w-6xl">
          <div className="mb-12 text-center animate-in fade-in slide-in-from-bottom-3 duration-1000">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Powered by Modern Tech Stack
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Built with the latest and greatest tools from the React ecosystem and beyond.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {techStack.map((stack, index) => (
              <div
                className="group rounded-lg border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/20 animate-in fade-in zoom-in-95 duration-700"
                key={index}
                style={{
                  animationDelay: `${(index + 1) * 100}ms`,
                }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-all group-hover:bg-primary/20 group-hover:scale-110">
                    <stack.icon className="size-5 transition-transform group-hover:rotate-6" />
                  </div>
                  <h3 className="text-lg font-semibold">{stack.category}</h3>
                </div>
                <ul className="space-y-2">
                  {stack.items.map((item, itemIndex) => (
                    <li
                      className="flex items-center gap-2 text-sm text-muted-foreground transition-all hover:text-foreground hover:translate-x-1"
                      key={itemIndex}
                    >
                      <div className="size-1.5 rounded-full bg-primary/60 transition-all group-hover:bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="mx-auto mt-32 max-w-4xl rounded-2xl border bg-linear-to-br from-primary/5 via-purple-500/5 to-primary/5 p-12 text-center shadow-lg animate-in fade-in zoom-in-95 duration-1000">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl animate-in fade-in slide-in-from-bottom-3 duration-700 delay-150">
            Ready to Build Something Amazing?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
            Get started with Raypx today and experience the power of modern full-stack development.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row animate-in fade-in zoom-in-95 duration-700 delay-500">
            <Link
              className="group inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 hover:shadow-xl hover:scale-110"
              params={{
                _splat: "",
              }}
              to="/docs/$"
            >
              Read Documentation
            </Link>
            <a
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:scale-110"
              href="https://github.com/raypx/raypx"
              rel="noopener noreferrer"
              target="_blank"
            >
              Star on GitHub
            </a>
          </div>
        </div>
      </main>
    </HomeLayout>
  );
}
