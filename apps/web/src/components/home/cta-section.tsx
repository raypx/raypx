import { Button } from "@raypx/ui/components/button";
import { IconRocket, IconSparkles } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import Container from "~/components/layout/container";
import { links } from "~/config/site";

export function CtaSection() {
  return (
    <section className="py-24 md:py-32">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center shadow-2xl md:px-16 md:py-24">
          {/* Animated Gradient Background */}
          <div className="absolute inset-0 opacity-50">
            <div className="absolute -top-[50%] -left-[20%] size-[800px] animate-blob rounded-full bg-primary/20 mix-blend-screen blur-[120px]" />
            <div
              className="absolute -right-[20%] -bottom-[50%] size-[800px] animate-blob rounded-full bg-purple-500/20 mix-blend-screen blur-[120px]"
              style={{ animationDelay: "4s" }}
            />
          </div>

          {/* Grid & Noise Texture */}
          <div className="pointer-events-none absolute inset-0 bg-[url('/noise.svg')] opacity-20 mix-blend-overlay" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

          {/* Content */}
          <div className="relative z-10 mx-auto max-w-3xl space-y-8">
            <h2 className="font-bold text-3xl text-white tracking-tight md:text-4xl lg:text-5xl">
              Ready to build your{" "}
              <span className="bg-linear-to-r from-primary to-purple-400 bg-clip-text py-1 text-transparent">
                Next big idea?
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-zinc-400 leading-relaxed md:text-xl">
              Stop wasting time on configuration. Start building with a production-ready foundation
              that scales with you.
            </p>

            <div className="flex w-full flex-col justify-center gap-4 pt-8 sm:w-auto sm:flex-row">
              <Link to={links.docs}>
                <Button
                  className="group relative h-14 w-full overflow-hidden px-8 font-semibold text-base sm:w-auto"
                  size="lg"
                >
                  <div className="absolute inset-0 translate-x-[-200%] animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
                  <IconRocket className="mr-2 size-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                  Get Started Now
                </Button>
              </Link>
              <a href="https://github.com/raypx/raypx" rel="noopener noreferrer" target="_blank">
                <Button
                  className="h-14 w-full border-zinc-700 bg-transparent px-8 text-base text-white transition-all duration-300 hover:border-zinc-600 hover:bg-zinc-800 sm:w-auto"
                  size="lg"
                  variant="outline"
                >
                  <IconSparkles className="mr-2 size-4 text-yellow-400" />
                  Star on GitHub
                </Button>
              </a>
            </div>

            <p className="pt-8 text-sm text-zinc-500">
              Free and open source under the Apache 2.0 License.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
