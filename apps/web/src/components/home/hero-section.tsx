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
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[30%] -left-[10%] size-[500px] rounded-full bg-purple-500/20 blur-[100px] animate-blob mix-blend-multiply dark:mix-blend-screen" />
        <div
          className="absolute top-[20%] -right-[10%] size-[500px] rounded-full bg-blue-500/20 blur-[100px] animate-blob mix-blend-multiply dark:mix-blend-screen"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute -bottom-[20%] left-[20%] size-[500px] rounded-full bg-pink-500/20 blur-[100px] animate-blob mix-blend-multiply dark:mix-blend-screen"
          style={{ animationDelay: "4s" }}
        />
        <div className="absolute inset-0 opacity-30">
          <FallingStarsBg count={50} />
        </div>
      </div>

      <Container className="relative pointer-events-none">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto z-10 relative">
          <TextHoverEffect className="w-full" strokeDuration={2} text="RAYPX" />
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
            The Modern Foundation for
            <span className="bg-linear-to-r from-blue-600 via-primary to-purple-600 bg-clip-text text-transparent animate-gradient bg-300%">
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
              <Button
                className="group relative overflow-hidden shadow-lg shadow-primary/20"
                size="lg"
              >
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] animate-shimmer" />
                <span className="relative z-10 flex items-center">
                  Get Started
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </span>
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
          <div className="relative rounded-xl border bg-background/50 backdrop-blur-sm shadow-2xl transform-3d rotate-x-20 group-hover:rotate-x-10 transition-transform duration-700 ease-out overflow-hidden animate-float">
            {/* Mock Browser Header */}
            <div className="h-10 border-b bg-muted/50 flex items-center px-4 gap-2">
              <div className="size-3 rounded-full bg-red-500/50" />
              <div className="size-3 rounded-full bg-yellow-500/50" />
              <div className="size-3 rounded-full bg-green-500/50" />
              <div className="ml-4 h-6 w-64 bg-muted rounded-md flex items-center px-2 text-xs text-muted-foreground">
                raypx.com/dashboard
              </div>
            </div>

            {/* Mock Content - Grid of abstract widgets */}
            <div className="p-6 grid grid-cols-12 gap-6 bg-background/95 backdrop-blur-xs h-[500px]">
              {/* Sidebar */}
              <div className="col-span-2 space-y-4 border-r pr-6 hidden md:block">
                <div className="h-8 w-full bg-muted/50 rounded-md animate-pulse" />
                <div className="space-y-2 pt-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      className={`h-8 w-full rounded-md flex items-center px-2 ${
                        i === 1 ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                      }`}
                      key={i}
                    >
                      <div
                        className={`size-4 rounded-sm ${
                          i === 1 ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      />
                      <div
                        className={`ml-2 h-2 w-16 rounded-sm ${
                          i === 1 ? "bg-primary/40" : "bg-muted-foreground/20"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Content */}
              <div className="col-span-12 md:col-span-10 space-y-6">
                {/* Header Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      className="h-24 rounded-xl border bg-card/50 p-4 space-y-3 shadow-xs"
                      key={i}
                    >
                      <div className="flex justify-between items-start">
                        <div className="h-4 w-12 bg-muted/50 rounded-sm" />
                        <div
                          className={`size-4 rounded-full ${
                            i % 2 === 0 ? "bg-green-500/20" : "bg-blue-500/20"
                          }`}
                        />
                      </div>
                      <div className="h-8 w-24 bg-foreground/10 rounded-sm" />
                    </div>
                  ))}
                </div>

                {/* Chart Area */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-64">
                  <div className="col-span-2 rounded-xl border bg-card/50 p-4 relative overflow-hidden shadow-xs flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-4">
                      <div className="h-4 w-32 bg-muted/50 rounded-sm" />
                      <div className="h-4 w-16 bg-muted/30 rounded-sm" />
                    </div>
                    <div className="relative h-full w-full flex items-end gap-2">
                      {[40, 70, 45, 90, 60, 80, 50, 75, 60, 95, 65, 85].map((h, i) => (
                        <div
                          className="w-full bg-primary/20 rounded-t-sm hover:bg-primary/40 transition-all duration-500 ease-in-out"
                          key={i}
                          style={{
                            height: `${h}%`,
                            animation: `pulse 2s infinite ${i * 0.1}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="hidden md:block col-span-1 rounded-xl border bg-card/50 p-4 space-y-4 shadow-xs">
                    <div className="h-4 w-24 bg-muted/50 rounded-sm mb-4" />
                    {[1, 2, 3, 4].map((i) => (
                      <div className="flex items-center gap-3" key={i}>
                        <div className="size-8 rounded-full bg-muted/50" />
                        <div className="space-y-1 flex-1">
                          <div className="h-3 w-full bg-muted/40 rounded-sm" />
                          <div className="h-2 w-2/3 bg-muted/30 rounded-sm" />
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
