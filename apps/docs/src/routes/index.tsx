import { HomeLayout } from "@fumadocs/base-ui/layouts/home";
import { createFileRoute, Link } from "@tanstack/react-router";
import { baseOptions } from "../lib/layout.shared";

export const Route = createFileRoute("/")({
  component: () => <RouteComponent />,
});

function RouteComponent() {
  const options = baseOptions();
  return (
    <>
      <HomeLayout {...options}>
        <main className="container mx-auto px-4 py-16">
          {/* Hero Section */}
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 font-bold text-5xl tracking-tight sm:text-6xl md:text-7xl">
              Raypx
            </h1>
            <p className="mb-8 text-muted-foreground text-xl leading-relaxed">
              A Turborepo-powered monorepo for building modern full-stack applications
              with{" "}
              <span className="font-semibold text-foreground">TanStack Start</span>,{" "}
              <span className="font-semibold text-foreground">React 19</span>, and{" "}
              <span className="font-semibold text-foreground">TypeScript</span>.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-8 font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                params={{ _splat: "" }}
                to="/docs/$"
              >
                Get Started
              </Link>
              <a
                className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-background px-8 font-medium transition-colors hover:bg-muted"
                href="https://github.com/raypx/raypx"
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub
              </a>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="mx-auto mt-24 max-w-4xl">
            <h2 className="mb-8 font-semibold text-2xl">Tech Stack</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-2 font-medium">Framework</h3>
                <p className="text-muted-foreground text-sm">
                  TanStack Start 1.135 + React 19 + TypeScript 5.9 + Vite 7
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-2 font-medium">Backend</h3>
                <p className="text-muted-foreground text-sm">
                  Better Auth + Drizzle ORM + ORPC + PostgreSQL
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-2 font-medium">UI & Styling</h3>
                <p className="text-muted-foreground text-sm">
                  Tailwind CSS v4 + Radix UI + shadcn/ui + 60+ Components
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-2 font-medium">Tooling</h3>
                <p className="text-muted-foreground text-sm">
                  bun 10+ + Turborepo + 14 Packages + Workspace Protocol
                </p>
              </div>
            </div>
          </div>

          {/* Quick Start */}
          <div className="mx-auto mt-16 max-w-4xl">
            <h2 className="mb-8 font-semibold text-2xl">Quick Start</h2>
            <div className="space-y-4 rounded-xl border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  1
                </span>
                <div>
                  <p className="font-medium">Clone and install</p>
                  <code className="mt-1 block rounded bg-muted px-3 py-2 text-sm">
                    git clone https://github.com/raypx/raypx.git
                    <br />
                    cd raypx && pnpm install
                  </code>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  2
                </span>
                <div>
                  <p className="font-medium">Configure environment</p>
                  <code className="mt-1 block rounded bg-muted px-3 py-2 text-sm">
                    cp .env.example .env
                    <br />
                    # Edit .env with DATABASE_URL and BETTER_AUTH_SECRET
                  </code>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  3
                </span>
                <div>
                  <p className="font-medium">Run migrations and start</p>
                  <code className="mt-1 block rounded bg-muted px-3 py-2 text-sm">
                    bun run --filter @raypx/database migrate
                    <br />
                    bun dev
                  </code>
                </div>
              </div>
            </div>
          </div>
        </main>
      </HomeLayout>
    </>
  );
}
