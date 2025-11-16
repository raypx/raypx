import { Badge } from "@raypx/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@raypx/ui/components/tooltip";
import Container from "@/components/layout/container";
import { useIsMobile } from "@/hooks/use-mobile";

type TechItem = {
  name: string;
  description: string;
  category: "framework" | "styling" | "backend" | "tooling";
};

const techStack: TechItem[] = [
  {
    name: "TanStack Start",
    description: "Modern React framework with file-based routing and server components.",
    category: "framework",
  },
  {
    name: "React 19",
    description: "Latest React features with concurrent rendering and stable hooks.",
    category: "framework",
  },
  {
    name: "TypeScript",
    description: "Type-safe development with strong tooling and DX.",
    category: "framework",
  },
  {
    name: "Vite",
    description: "Fast dev server and optimized builds.",
    category: "tooling",
  },
  {
    name: "Tailwind CSS",
    description: "Utility-first styling for rapid UI development.",
    category: "styling",
  },
  {
    name: "Radix UI",
    description: "Accessible, unstyled primitives powering composable components.",
    category: "styling",
  },
  {
    name: "shadcn/ui",
    description: "Opinionated UI patterns built on Radix + Tailwind.",
    category: "styling",
  },
  {
    name: "Drizzle ORM",
    description: "Type-safe SQL builder and migrations.",
    category: "backend",
  },
  {
    name: "PostgreSQL",
    description: "Reliable relational database for scale and consistency.",
    category: "backend",
  },
  {
    name: "tRPC",
    description: "End-to-end typesafe APIs with zero schema duplication.",
    category: "backend",
  },
  {
    name: "pnpm",
    description: "Fast, disk-efficient package manager.",
    category: "tooling",
  },
  {
    name: "Turborepo",
    description: "High-performance build system for JS/TS monorepos.",
    category: "tooling",
  },
  {
    name: "Biome",
    description: "Formatter/linter for consistent code quality.",
    category: "tooling",
  },
  {
    name: "Vitest",
    description: "Blazing-fast unit testing powered by Vite.",
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
  const isMobile = useIsMobile();
  return (
    <section className="py-20 md:py-32" id="tech-stack">
      <Container>
        <div className="space-y-12">
          {/* Section header */}
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              Tech Stack
            </h2>
            <p className="text-lg text-muted-foreground">
              Modern foundations focused on performance, DX, and reliability.
            </p>
          </div>

          {/* Tech badges with tooltips on desktop, inline descriptions on mobile */}
          {isMobile ? (
            <div className="flex flex-col gap-3 max-w-3xl mx-auto text-left">
              {techStack.map((tech, index) => (
                <div className="flex flex-col gap-1.5" key={index}>
                  <div className="flex items-center gap-2">
                    <Badge className="px-3 py-1.5" variant={categoryColors[tech.category]}>
                      {tech.name}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{tech.description}</p>
                </div>
              ))}
            </div>
          ) : (
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
                      <p>{tech.description}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          )}

          {/* Category legend */}
          <div className="flex flex-wrap gap-6 justify-center items-center text-sm text-muted-foreground pt-8">
            <div className="flex items-center gap-2">
              <Badge className="size-3 p-0" variant="default" />
              <span>Framework</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="size-3 p-0" variant="secondary" />
              <span>Styling</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="size-3 p-0" variant="outline" />
              <span>Backend</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="size-3 p-0" variant="secondary" />
              <span>Tooling</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
