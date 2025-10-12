import { Button } from "@raypx/ui/components/button";
import { Card } from "@raypx/ui/components/card";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Github } from "lucide-react";
import { useTranslation } from "react-i18next";
import Container from "@/components/layout/container";

export function CtaSection() {
  const { t } = useTranslation("home");

  return (
    <section className="py-20 md:py-32 bg-muted/30">
      <Container>
        <Card className="relative overflow-hidden border-2">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/10 to-background" />

          <div className="relative p-8 md:p-12 lg:p-16">
            <div className="max-w-3xl mx-auto text-center space-y-8">
              {/* Heading */}
              <div className="space-y-4">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
                  {t("cta.heading")}
                </h2>
                <p className="text-lg text-muted-foreground">{t("cta.subheading")}</p>
              </div>

              {/* Code snippet */}
              <div className="bg-card/80 backdrop-blur-sm border rounded-lg p-6 font-mono text-sm text-left">
                <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                  <div className="size-3 rounded-full bg-red-500" />
                  <div className="size-3 rounded-full bg-yellow-500" />
                  <div className="size-3 rounded-full bg-green-500" />
                </div>
                <pre className="overflow-x-auto">
                  <code className="text-foreground">
                    {`# Clone the repository
git clone https://github.com/raypx/raypx.git
cd raypx

# Install dependencies
pnpm install

# Start development
pnpm dev`}
                  </code>
                </pre>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-4">
                <Link to="/docs">
                  <Button className="group" size="lg">
                    <BookOpen className="mr-2 size-4" />
                    {t("cta.readDocs")}
                    <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <a href="https://github.com/raypx/raypx" rel="noopener noreferrer" target="_blank">
                  <Button size="lg" variant="outline">
                    <Github className="mr-2 size-4" />
                    {t("cta.starGithub")}
                  </Button>
                </a>
              </div>

              {/* Additional info */}
              <p className="text-sm text-muted-foreground">{t("cta.license")}</p>
            </div>
          </div>
        </Card>
      </Container>
    </section>
  );
}
