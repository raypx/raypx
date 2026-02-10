export type SiteLinks = {
  docs: string;
  github: string;
};

export type SiteBrand = {
  name: string;
};

export const brand: SiteBrand = {
  name: "Raypx",
};

export const links: SiteLinks = {
  docs: "/docs",
  github: "https://github.com/raypx/raypx",
};

export const siteConfig = {
  brand,
  links,
  // SEO
  title: "Raypx - Modern Full-Stack Monorepo Template",
  description:
    "A production-ready monorepo template powered by Turborepo, featuring TanStack Start, React 19, TypeScript, Better Auth, Drizzle ORM, and more. Build scalable full-stack applications with enterprise-grade security and type safety.",
  keywords: [
    "React",
    "React 19",
    "TypeScript",
    "TanStack Start",
    "Turborepo",
    "monorepo",
    "full-stack",
    "Better Auth",
    "Drizzle ORM",
    "shadcn/ui",
    "Vite",
    "Next.js alternative",
    "SSR",
    "SSG",
    "RSC",
  ],
  url: "https://raypx.com",
  author: "Raypx",
  image: "/og.png",
};
