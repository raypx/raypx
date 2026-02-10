import type { ComponentType, CSSProperties, SVGProps } from "react";
import { Marquee } from "./marquee";
import { Icons } from "./tech-icons";

type TechItem = {
  name: string;
  description: string;
  color: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

const techStackRow1: TechItem[] = [
  {
    name: "TanStack Start",
    description: "React Framework",
    color: "#71717a",
    icon: Icons.TanStackStart,
  },
  { name: "React 19", description: "UI Library", color: "#61DAFB", icon: Icons.React },
  {
    name: "TypeScript",
    description: "Type Safety",
    color: "#3178C6",
    icon: Icons.TypeScript,
  },
  { name: "Vite", description: "Build Tool", color: "#646CFF", icon: Icons.Vite },
  {
    name: "Tailwind CSS",
    description: "Styling",
    color: "#06B6D4",
    icon: Icons.TailwindCSS,
  },
  { name: "Radix UI", description: "Primitives", color: "#0091FF", icon: Icons.RadixUI },
  {
    name: "shadcn/ui",
    description: "Components",
    color: "#000000",
    icon: Icons.ShadcnUI,
  },
];

const techStackRow2: TechItem[] = [
  {
    name: "Drizzle ORM",
    description: "Database ORM",
    color: "#C5F74F",
    icon: Icons.DrizzleORM,
  },
  {
    name: "PostgreSQL",
    description: "Database",
    color: "#336791",
    icon: Icons.PostgreSQL,
  },
  { name: "pnpm", description: "Package Manager", color: "#F69220", icon: Icons.pnpm },
  {
    name: "Turborepo",
    description: "Monorepo Tool",
    color: "#EF4444",
    icon: Icons.Turborepo,
  },
  {
    name: "Biome",
    description: "Linter/Formatter",
    color: "#FBBC04",
    icon: Icons.Biome,
  },
  { name: "Vitest", description: "Testing", color: "#FCC72B", icon: Icons.Vitest },
];

const TechCard = ({ name, description, color, icon: Icon }: TechItem) => (
  <div
    className="group relative flex h-14 w-40 items-center space-x-3 rounded-xl border bg-background/50 p-3 backdrop-blur-sm transition-all duration-300 hover:bg-accent/50 hover:shadow-lg md:h-16 md:w-52 md:space-x-4 md:p-4"
    style={{ "--tech-color": color } as CSSProperties}
  >
    <div
      className="flex size-8 shrink-0 items-center justify-center rounded-full font-bold text-xs transition-transform group-hover:scale-110"
      style={{
        backgroundColor: `${color}20`,
        color: color,
      }}
    >
      {Icon ? <Icon className="size-5" /> : name[0]}
    </div>
    <div className="flex flex-col overflow-hidden text-left">
      <span className="w-full truncate font-medium text-sm leading-none">{name}</span>
      <span className="truncate text-muted-foreground text-xs transition-colors group-hover:text-(--tech-color)">
        {description}
      </span>
    </div>
  </div>
);

export function TechStackSection() {
  return (
    <section className="relative overflow-hidden bg-background py-12 md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_0,transparent_100%)]" />

      <div className="container relative z-10 mx-auto mb-10 px-4 text-center md:px-6">
        <h2 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
          Powered by{" "}
          <span className="bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            Modern Tech
          </span>
        </h2>
        <p className="text-lg text-muted-foreground">
          Built with the best tools in the React ecosystem.
        </p>
      </div>

      <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
        <Marquee className="[--duration:30s] md:[--duration:40s]" pauseOnHover={false}>
          {techStackRow1.map((item, i) => (
            <TechCard key={i} {...item} />
          ))}
        </Marquee>
        <Marquee className="mt-4 [--duration:30s] md:[--duration:40s]" pauseOnHover={false} reverse>
          {techStackRow2.map((item, i) => (
            <TechCard key={i} {...item} />
          ))}
        </Marquee>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-background" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-background" />
      </div>
    </section>
  );
}
