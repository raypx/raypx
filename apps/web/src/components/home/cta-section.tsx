import { Button } from "@raypx/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Rocket, Sparkles } from "lucide-react";
import Container from "~/components/layout/container";
import { links } from "~/config/site";

export function CtaSection() {
  return (
    <section className="py-24 md:py-32">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-zinc-900 px-6 py-16 text-center shadow-2xl md:px-16 md:py-24 border border-zinc-800">
          {/* Animated Gradient Background */}
          <div className="absolute inset-0 opacity-50">
            <div className="absolute -top-[50%] -left-[20%] size-[800px] rounded-full bg-primary/20 blur-[120px] animate-blob mix-blend-screen" />
            <div
              className="absolute -bottom-[50%] -right-[20%] size-[800px] rounded-full bg-purple-500/20 blur-[120px] animate-blob mix-blend-screen"
              style={{ animationDelay: "4s" }}
            />
          </div>

          {/* Grid & Noise Texture */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

          {/* Content */}
          <div className="relative z-10 max-w-3xl mx-auto space-y-8">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white">
              Ready to build your{" "}
              <span className="bg-linear-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                next big idea?
              </span>
            </h2>
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Stop wasting time on configuration. Start building with a production-ready foundation
              that scales with you.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8 w-full sm:w-auto">
              <Link to={links.docs}>
                <Button
                  className="w-full sm:w-auto h-14 px-8 text-base font-semibold group relative overflow-hidden"
                  size="lg"
                >
                  <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] animate-shimmer" />
                  <Rocket className="mr-2 size-4 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
                  Get Started Now
                </Button>
              </Link>
              <a href="https://github.com/raypx/raypx" rel="noopener noreferrer" target="_blank">
                <Button
                  className="w-full sm:w-auto h-14 px-8 text-base border-zinc-700 hover:bg-zinc-800 text-white bg-transparent transition-all duration-300 hover:border-zinc-600"
                  size="lg"
                  variant="outline"
                >
                  <Sparkles className="mr-2 size-4 text-yellow-400" />
                  Star on GitHub
                </Button>
              </a>
            </div>

            <p className="text-sm text-zinc-500 pt-8">
              Free and open source under the MIT License.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
