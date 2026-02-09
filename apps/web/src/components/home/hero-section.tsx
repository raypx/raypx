import { Button, TextHoverEffect } from "@raypx/ui/components";
import { cn } from "@raypx/ui/lib/utils";
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import Container from "~/components/layout/container";
import { links } from "~/config/site";
import { FallingStarsBg } from "./falling-stars-bg";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-16 md:py-32">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/5 via-background to-background" />

      {/* Animated background elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[30%] -left-[10%] size-[500px] animate-blob rounded-full bg-purple-500/20 mix-blend-multiply blur-[100px] dark:mix-blend-screen" />
        <div
          className="absolute top-[20%] -right-[10%] size-[500px] animate-blob rounded-full bg-blue-500/20 mix-blend-multiply blur-[100px] dark:mix-blend-screen"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute -bottom-[20%] left-[20%] size-[500px] animate-blob rounded-full bg-pink-500/20 mix-blend-multiply blur-[100px] dark:mix-blend-screen"
          style={{ animationDelay: "4s" }}
        />
        <div className="absolute inset-0 opacity-30">
          <FallingStarsBg count={50} />
        </div>
      </div>

      <Container className="pointer-events-none relative">
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center space-y-8 text-center">
          <TextHoverEffect className="w-full" strokeDuration={2} text="RAYPX" />
          <h1 className="font-bold text-4xl tracking-tight md:text-6xl lg:text-7xl">
            The Modern Foundation for
            <span className="animate-gradient bg-300% bg-linear-to-r from-blue-600 via-primary to-purple-600 bg-clip-text text-transparent">
              {" "}
              AI Applications
            </span>
          </h1>

          {/* Subheading */}
          <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
            Production-ready starter kit for building scalable, type-safe web applications with
            React 19, TanStack Start, and modern AI capabilities.
          </p>

          {/* CTA Buttons */}
          <div className="pointer-events-auto flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Link to={links.docs}>
              <Button
                className="group relative overflow-hidden shadow-lg shadow-primary/20"
                size="lg"
              >
                <div className="absolute inset-0 translate-x-[-200%] animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
                <span className="relative z-10 flex items-center">
                  Get Started
                  <IconArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
            </Link>
            <a href="https://github.com/raypx/raypx" rel="noopener noreferrer" target="_blank">
              <Button className="group" size="lg" variant="outline">
                <IconBrandGithub className="mr-2 size-4" />
                View on GitHub
              </Button>
            </a>
          </div>

          {/* Stats or social proof */}
          <div className="flex flex-wrap items-center justify-center gap-8 pt-8 text-muted-foreground text-sm">
            <div className="flex items-center gap-2">
              <div className="size-2 animate-pulse rounded-full bg-green-500" />
              <span>Production Ready</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">React 19</span>
              <span>•</span>
              <span className="font-semibold text-foreground">TypeScript</span>
              <span>•</span>
              <span className="font-semibold text-foreground">TanStack</span>
            </div>
          </div>
        </div>

        {/* Dashboard Preview - 3D Perspective */}
        <div className="perspective-[2000px] group pointer-events-auto relative mx-auto mt-20 max-w-6xl">
          <div className="transform-3d relative rotate-x-20 animate-float overflow-hidden rounded-xl border bg-background/50 shadow-2xl backdrop-blur-sm transition-transform duration-700 ease-out group-hover:rotate-x-10">
            {/* Mock Browser Header */}
            <div className="flex h-10 items-center gap-2 border-b bg-muted/50 px-4">
              <div className="size-3 rounded-full bg-red-500/50" />
              <div className="size-3 rounded-full bg-yellow-500/50" />
              <div className="size-3 rounded-full bg-green-500/50" />
              <div className="ml-4 flex h-6 w-64 items-center rounded-md bg-muted px-2 text-muted-foreground text-xs">
                raypx.com/dashboard
              </div>
            </div>

            {/* Mock Content - Grid of abstract widgets */}
            <div className="grid h-[500px] grid-cols-12 gap-6 bg-background/95 p-6 backdrop-blur-xs">
              {/* Sidebar */}
              <div className="col-span-2 hidden space-y-4 border-r pr-6 md:block">
                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                <div className="space-y-2 pt-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      className={cn(
                        "flex h-8 w-full items-center rounded-md px-2",
                        i === 1 ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
                      )}
                      key={i}
                    >
                      <div
                        className={cn(
                          "size-4 rounded-sm",
                          i === 1 ? "bg-primary" : "bg-muted-foreground/30",
                        )}
                      />
                      <div
                        className={cn(
                          "ml-2 h-2 w-16 rounded-sm",
                          i === 1 ? "bg-primary/40" : "bg-muted-foreground/20",
                        )}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Content */}
              <div className="col-span-12 space-y-6 md:col-span-10">
                {/* Header Stats */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      className="h-24 space-y-3 rounded-xl border bg-card/50 p-4 shadow-xs"
                      key={i}
                    >
                      <div className="flex items-start justify-between">
                        <div className="h-4 w-12 rounded-sm bg-muted/50" />
                        <div
                          className={cn(
                            "size-4 rounded-full",
                            i % 2 === 0 ? "bg-green-500/20" : "bg-blue-500/20",
                          )}
                        />
                      </div>
                      <div className="h-8 w-24 rounded-sm bg-foreground/10" />
                    </div>
                  ))}
                </div>

                {/* Chart Area */}
                <div className="grid h-64 grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="relative col-span-2 flex flex-col justify-between overflow-hidden rounded-xl border bg-card/50 p-4 shadow-xs">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="h-4 w-32 rounded-sm bg-muted/50" />
                      <div className="h-4 w-16 rounded-sm bg-muted/30" />
                    </div>
                    <div className="relative flex h-full w-full items-end gap-2">
                      {[40, 70, 45, 90, 60, 80, 50, 75, 60, 95, 65, 85].map((h, i) => (
                        <div
                          className="w-full rounded-t-sm bg-primary/20 transition-all duration-500 ease-in-out hover:bg-primary/40"
                          key={i}
                          style={{
                            height: `${h}%`,
                            animation: `pulse 2s infinite ${i * 0.1}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="col-span-1 hidden space-y-4 rounded-xl border bg-card/50 p-4 shadow-xs md:block">
                    <div className="mb-4 h-4 w-24 rounded-sm bg-muted/50" />
                    {[1, 2, 3, 4].map((i) => (
                      <div className="flex items-center gap-3" key={i}>
                        <div className="size-8 rounded-full bg-muted/50" />
                        <div className="flex-1 space-y-1">
                          <div className="h-3 w-full rounded-sm bg-muted/40" />
                          <div className="h-2 w-2/3 rounded-sm bg-muted/30" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Gradient Overlay for Glow */}
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent" />
          </div>

          {/* Bottom Glow */}
          <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[3rem] bg-primary/20 opacity-50 blur-3xl" />
        </div>
      </Container>
    </section>
  );
}
