import { Button } from "@raypx/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Rocket, Sparkles } from "lucide-react";
import Container from "~/components/layout/container";
import { links } from "~/config/site";

export function CtaSection() {
  return (
    <section className="py-24 md:py-32">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center shadow-2xl md:px-16 md:py-24">
          {/* Background Pattern - CSS Grid */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff20_1px,transparent_1px),linear-gradient(to_bottom,#ffffff20_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
          </div>

          {/* Glowing Orbs */}
          <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-white/20 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto space-y-8 text-primary-foreground">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              Ready to build your next big idea?
            </h2>
            <p className="text-lg md:text-xl opacity-90 max-w-2xl mx-auto leading-relaxed">
              Stop wasting time on configuration. Start building with a production-ready foundation
              that scales with you.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 w-full sm:w-auto">
              <Link to={links.docs}>
                <Button
                  className="w-full sm:w-auto h-14 px-8 text-base font-semibold group"
                  size="lg"
                  variant="secondary"
                >
                  <Rocket className="mr-2 size-4 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
                  Get Started Now
                </Button>
              </Link>
              <a href="https://github.com/raypx/raypx" rel="noopener noreferrer" target="_blank">
                <Button
                  className="w-full sm:w-auto h-14 px-8 text-base border-primary-foreground/20 hover:bg-primary-foreground/10 hover:text-primary-foreground text-primary-foreground bg-transparent"
                  size="lg"
                  variant="outline"
                >
                  <Sparkles className="mr-2 size-4" />
                  Star on GitHub
                </Button>
              </a>
            </div>

            <p className="text-sm opacity-70 pt-4">Free and open source under the MIT License.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
