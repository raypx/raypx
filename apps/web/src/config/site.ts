// Consolidated config in a single file with clear sections

export type MenuLink = {
  title: string;
  href: string;
  external?: boolean;
};

export type FooterSection = {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
};

export type Brand = {
  name: string;
  logoLight: string;
  logoDark: string;
  tagline: string;
};

export type Links = {
  docs: string;
  contact: string;
  github: string;
  twitter: string;
  changelog: string;
  issues: string;
  discussions: string;
  contributing: string;
  roadmap: string;
};

export type Navigation = {
  main: MenuLink[];
};

export type Footer = {
  sections: FooterSection[];
};

export type FeatureFlags = {
  enableDocs: boolean;
};

export type SiteConfig = {
  brand: Brand;
  links: Links;
  navigation: Navigation;
  footer: Footer;
  featureFlags?: FeatureFlags;
};

// Brand
export const brand: Brand = {
  name: "Raypx",
  logoLight: "/logo.png",
  logoDark: "/logo-dark.png",
  tagline: "Modern full-stack framework",
};

// Links
export const links: Links = {
  docs: "https://docs.raypx.com",
  github: "https://github.com/raypx/raypx",
  twitter: "https://twitter.com/raypx",
  contact: "https://github.com/raypx/raypx/issues",
  changelog: "https://github.com/raypx/raypx/releases",
  issues: "https://github.com/raypx/raypx/issues",
  discussions: "https://github.com/raypx/raypx/discussions",
  contributing: "https://github.com/raypx/raypx#-contributing",
  roadmap: "https://github.com/raypx/raypx",
};

// Navigation
export const navigation: Navigation = {
  main: [
    { title: "Home", href: "/" },
    { title: "Docs", href: links.docs, external: true },
  ],
};

// Footer
export const footer: Footer = {
  sections: [
    {
      title: "Product",
      links: [
        { label: "Overview", href: "/" },
        { label: "Tech Stack", href: "/#tech-stack" },
        { label: "Roadmap", href: "https://github.com/raypx/raypx", external: true },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Docs", href: "/docs" },
        { label: "GitHub", href: "https://github.com/raypx/raypx", external: true },
        { label: "Changelog", href: "https://github.com/raypx/raypx/releases", external: true },
      ],
    },
    {
      title: "Community",
      links: [
        { label: "Issues", href: "https://github.com/raypx/raypx/issues", external: true },
        {
          label: "Discussions",
          href: "https://github.com/raypx/raypx/discussions",
          external: true,
        },
        {
          label: "Contributing",
          href: "https://github.com/raypx/raypx#-contributing",
          external: true,
        },
      ],
    },
  ],
};

// Feature flags
export const featureFlags: FeatureFlags = {
  enableDocs: true,
};

// Aggregated export
export const siteConfig: SiteConfig = {
  brand,
  links,
  navigation,
  footer,
  featureFlags,
};
