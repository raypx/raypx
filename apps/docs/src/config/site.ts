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
};
