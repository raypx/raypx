import { Button, TextHoverEffect } from "@raypx/ui/components";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Github, Sparkles } from "lucide-react";
import Container from "~/components/layout/container";
// import { FallingStarsBg } from "./falling-stars-bg";
import { links } from "~/config/site";

export function HeroSection() {
  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-background to-background pointer-events-none" />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <TextHoverEffect text="RAYPX" />
        {/* <FallingStarsBg className="opacity-30" color="#FFF" count={100} /> */}
        <div className="absolute -top-40 -right-40 size-80 bg-primary/10 rounded-full blur-3xl animate-pulse motion-reduce:animate-none" />
        <div className="absolute -bottom-40 -left-40 size-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000 motion-reduce:animate-none" />
      </div>

      <Container className="relative pointer-events-none">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
          {/* <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-card/50 backdrop-blur-sm text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            <span>Core Architecture Complete - Ready for Production</span>
          </div> */}

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
            Build AI-Powered Applications with
            <span className="bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {" "}
              Enterprise-Grade Security
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
            A modern, high-performance web application platform built with TanStack Start and React
            19, designed specifically for building scalable AI-powered applications with
            uncompromising type safety.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-4 pointer-events-auto">
            <Link to={links.docs}>
              <Button className="group" size="lg">
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
      </Container>
    </section>
  );
}
