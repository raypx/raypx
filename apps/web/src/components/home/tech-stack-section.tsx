import { Marquee } from "./marquee";

type TechItem = {
  name: string;
  description: string;
  icon?: string; // Optional icon path or component
};

const techStackRow1: TechItem[] = [
  { name: "TanStack Start", description: "React Framework" },
  { name: "React 19", description: "UI Library" },
  { name: "TypeScript", description: "Type Safety" },
  { name: "Vite", description: "Build Tool" },
  { name: "Tailwind CSS", description: "Styling" },
  { name: "Radix UI", description: "Primitives" },
  { name: "shadcn/ui", description: "Components" },
];

const techStackRow2: TechItem[] = [
  { name: "Drizzle ORM", description: "Database ORM" },
  { name: "PostgreSQL", description: "Database" },
  { name: "tRPC", description: "API Layer" },
  { name: "pnpm", description: "Package Manager" },
  { name: "Turborepo", description: "Monorepo Tool" },
  { name: "Biome", description: "Linter/Formatter" },
  { name: "Vitest", description: "Testing" },
];

const TechCard = ({ name, description }: TechItem) => (
  <div className="relative flex h-16 w-52 items-center space-x-4 rounded-xl border bg-background/50 backdrop-blur-sm p-4 hover:bg-accent/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 group">
    {/* Placeholder icon */}
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary group-hover:scale-110 transition-transform">
      {name[0]}
    </div>
    <div className="flex flex-col overflow-hidden text-left">
      <span className="text-sm font-medium leading-none">{name}</span>
      <span className="text-xs text-muted-foreground truncate group-hover:text-primary/80 transition-colors">
        {description}
      </span>
    </div>
  </div>
);

export function TechStackSection() {
  return (
    <section className="py-20 md:py-32 overflow-hidden bg-background relative">
      {/* Spotlight Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_0,transparent_100%)] pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 mb-10 text-center relative z-10">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
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
        <Marquee className="[--duration:40s]" pauseOnHover>
          {techStackRow1.map((item, i) => (
            <TechCard key={i} {...item} />
          ))}
        </Marquee>
        <Marquee className="[--duration:40s] mt-4" pauseOnHover reverse>
          {techStackRow2.map((item, i) => (
            <TechCard key={i} {...item} />
          ))}
        </Marquee>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-background"></div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-background"></div>
      </div>
    </section>
  );
}
