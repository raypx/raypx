import { useLocale } from "@raypx/i18n/client";
import { Badge } from "@raypx/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@raypx/ui/components/tooltip";
import Container from "@/components/layout/container";

type TechItem = {
  name: string;
  descriptionKey: string;
  category: "framework" | "styling" | "backend" | "tooling";
};

const techStack: TechItem[] = [
  {
    name: "TanStack Start",
    descriptionKey: "techStack.tanstackStart",
    category: "framework",
  },
  {
    name: "React 19",
    descriptionKey: "techStack.react19",
    category: "framework",
  },
  {
    name: "TypeScript",
    descriptionKey: "techStack.typescript",
    category: "framework",
  },
  {
    name: "Vite",
    descriptionKey: "techStack.vite",
    category: "tooling",
  },
  {
    name: "Tailwind CSS",
    descriptionKey: "techStack.tailwind",
    category: "styling",
  },
  {
    name: "Radix UI",
    descriptionKey: "techStack.radix",
    category: "styling",
  },
  {
    name: "shadcn/ui",
    descriptionKey: "techStack.shadcn",
    category: "styling",
  },
  {
    name: "Drizzle ORM",
    descriptionKey: "techStack.drizzle",
    category: "backend",
  },
  {
    name: "PostgreSQL",
    descriptionKey: "techStack.postgres",
    category: "backend",
  },
  {
    name: "tRPC",
    descriptionKey: "techStack.trpc",
    category: "backend",
  },
  {
    name: "pnpm",
    descriptionKey: "techStack.pnpm",
    category: "tooling",
  },
  {
    name: "Turborepo",
    descriptionKey: "techStack.turborepo",
    category: "tooling",
  },
  {
    name: "Biome",
    descriptionKey: "techStack.biome",
    category: "tooling",
  },
  {
    name: "Vitest",
    descriptionKey: "techStack.vitest",
    category: "tooling",
  },
];

const categoryColors = {
  framework: "default",
  styling: "secondary",
  backend: "outline",
  tooling: "secondary",
} as const;

export function TechStackSection() {
  const { t } = useLocale("home");
  return (
    <section className="py-20 md:py-32">
      <Container>
        <div className="space-y-12">
          {/* Section header */}
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              {t("techStack.heading")}
            </h2>
            <p className="text-lg text-muted-foreground">{t("techStack.subheading")}</p>
          </div>

          {/* Tech badges with tooltips */}
          <TooltipProvider>
            <div className="flex flex-wrap gap-3 justify-center items-center max-w-5xl mx-auto">
              {techStack.map((tech, index) => (
                <Tooltip key={index}>
                  <TooltipTrigger>
                    <Badge
                      className="px-4 py-2 text-sm font-medium cursor-help hover:scale-105 transition-transform"
                      variant={categoryColors[tech.category]}
                    >
                      {tech.name}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>{t(tech.descriptionKey)}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>

          {/* Category legend */}
          <div className="flex flex-wrap gap-6 justify-center items-center text-sm text-muted-foreground pt-8">
            <div className="flex items-center gap-2">
              <Badge className="size-3 p-0" variant="default" />
              <span>{t("techStack.categories.framework")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="size-3 p-0" variant="secondary" />
              <span>{t("techStack.categories.styling")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="size-3 p-0" variant="outline" />
              <span>{t("techStack.categories.backend")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="size-3 p-0" variant="secondary" />
              <span>{t("techStack.categories.tooling")}</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
