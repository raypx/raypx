import { Button, TextHoverEffect } from "@raypx/ui/components";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Github } from "lucide-react";
import Container from "~/components/layout/container";
import { links } from "~/config/site";
import { FallingStarsBg } from "./falling-stars-bg";

export function HeroSection() {
  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-background to-background pointer-events-none" />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <TextHoverEffect strokeDuration={2} text="RAYPX" />
        <div className="absolute inset-0 pointer-events-none">
          <FallingStarsBg className="opacity-30" count={100} />
        </div>
        <div className="absolute -top-40 -right-40 size-80 bg-primary/10 rounded-full blur-3xl animate-pulse motion-reduce:animate-none pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 size-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000 motion-reduce:animate-none pointer-events-none" />
      </div>

      <Container className="relative pointer-events-none">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto z-10 relative">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
            The Modern Foundation for
            <span className="bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {" "}
              AI Applications
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
            Production-ready starter kit for building scalable, type-safe web applications with
            React 19, TanStack Start, and modern AI capabilities.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-4 pointer-events-auto">
            <Link to={links.docs}>
              <Button className="group shadow-lg shadow-primary/20" size="lg">
                Get Started
                <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <a href="https://github.com/raypx/raypx" rel="noopener noreferrer" target="_blank">
              <Button className="group" size="lg" variant="outline">
                <Github className="mr-2 size-4" />
                View on GitHub
              </Button>
            </a>
          </div>

          {/* Stats or social proof */}
          <div className="flex flex-wrap gap-8 items-center justify-center pt-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-green-500 animate-pulse" />
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
        <div className="mt-20 relative max-w-6xl mx-auto perspective-[2000px] group pointer-events-auto">
          <div className="relative rounded-xl border bg-background/50 backdrop-blur-sm shadow-2xl transform-3d rotate-x-20 group-hover:rotate-x-10 transition-transform duration-700 ease-out overflow-hidden">
            {/* Mock Browser Header */}
            <div className="h-10 border-b bg-muted/50 flex items-center px-4 gap-2">
              <div className="size-3 rounded-full bg-red-500/50" />
              <div className="size-3 rounded-full bg-yellow-500/50" />
              <div className="size-3 rounded-full bg-green-500/50" />
              <div className="ml-4 h-6 w-64 bg-muted rounded-md flex items-center px-2 text-xs text-muted-foreground">
                raypx.app/dashboard
              </div>
            </div>

            {/* Mock Content - Grid of abstract widgets */}
            <div className="p-6 grid grid-cols-12 gap-6 bg-background h-[500px]">
              {/* Sidebar */}
              <div className="col-span-2 space-y-4 border-r pr-6">
                <div className="h-8 w-full bg-muted/50 rounded-md animate-pulse" />
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div className="h-6 w-full bg-muted/30 rounded-md" key={i} />
                  ))}
                </div>
              </div>

              {/* Main Content */}
              <div className="col-span-10 space-y-6">
                {/* Header Stats */}
                <div className="grid grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div className="h-24 rounded-lg border bg-card p-4 space-y-2" key={i}>
                      <div className="h-4 w-12 bg-muted/50 rounded" />
                      <div className="h-8 w-24 bg-primary/10 rounded" />
                    </div>
                  ))}
                </div>

                {/* Chart Area */}
                <div className="grid grid-cols-3 gap-6 h-64">
                  <div className="col-span-2 rounded-lg border bg-card p-4 relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 right-0 h-48 bg-linear-to-t from-primary/20 to-transparent" />
                    <div className="absolute bottom-0 left-4 right-4 h-px bg-border" />
                  </div>
                  <div className="col-span-1 rounded-lg border bg-card p-4 space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div className="flex items-center gap-3" key={i}>
                        <div className="size-8 rounded-full bg-muted" />
                        <div className="space-y-1 flex-1">
                          <div className="h-3 w-full bg-muted rounded" />
                          <div className="h-2 w-2/3 bg-muted/50 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Gradient Overlay for Glow */}
            <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Bottom Glow */}
          <div className="absolute -inset-4 -z-10 bg-primary/20 blur-3xl rounded-[3rem] opacity-50 pointer-events-none" />
        </div>
      </Container>
    </section>
  );
}
