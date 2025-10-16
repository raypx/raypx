import { Button } from "@raypx/ui/components";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Github, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import Container from "@/components/layout/container";
import { useAppLanguage } from "@/state/app-store";

export function HeroSection() {
  const { t } = useTranslation("home");
  const { language } = useAppLanguage();

  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background pointer-events-none" />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 size-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 size-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <Container className="relative">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-card/50 backdrop-blur-sm text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            <span>{t("hero.badge")}</span>
          </div>

          {/* Main headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
            {t("hero.title")}
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {" "}
              {t("hero.titleHighlight")}
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
            {t("hero.description")}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-4">
            <Link params={{ lang: language }} to="/$lang/docs">
              <Button className="group" size="lg">
                {t("hero.getStarted")}
                <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <a href="https://github.com/raypx/raypx" rel="noopener noreferrer" target="_blank">
              <Button className="group" size="lg" variant="outline">
                <Github className="mr-2 size-4" />
                {t("hero.viewGithub")}
              </Button>
            </a>
          </div>

          {/* Stats or social proof */}
          <div className="flex flex-wrap gap-8 items-center justify-center pt-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-green-500 animate-pulse" />
              <span>{t("hero.status")}</span>
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
