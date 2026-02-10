import type { ComponentType } from "react";

export interface SiteConfig {
  name: string;
  title: string;
  description: string;
  keywords: string[];
  url: string;
  author: string;
  image: string;
  github?: string;
  twitter?: string;
}

export interface MetaTags {
  charSet?: string;
  name?: string;
  content?: string;
  property?: string;
  rel?: string;
  type?: string;
  href?: string;
  hreflang?: string;
  sizes?: string;
  color?: string;
}

export interface LinkTag {
  rel?: string;
  type?: string;
  href?: string;
  sizes?: string;
  color?: string;
}

export interface ScriptTag {
  type?: string;
  innerHTML?: string;
}

export interface HeadConfig {
  meta?: MetaTags[];
  links?: LinkTag[];
  scripts?: ScriptTag[];
}

/**
 * Generate standard SEO meta tags
 */
export function generateSeoMeta(config: SiteConfig): MetaTags[] {
  return [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "description", content: config.description },
    { name: "keywords", content: config.keywords.join(", ") },
    { name: "author", content: config.author },
  ];
}

/**
 * Generate Open Graph meta tags for social media sharing
 */
export function generateOpenGraphMeta(config: SiteConfig): MetaTags[] {
  const tags: MetaTags[] = [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: config.name },
    { property: "og:title", content: config.title },
    { property: "og:description", content: config.description },
    { property: "og:url", content: config.url },
    { property: "og:image", content: `${config.url}${config.image}` },
  ];

  if (config.twitter) {
    tags.push({ property: "og:article:author", content: config.twitter });
  }

  return tags;
}

/**
 * Generate Twitter Card meta tags
 */
export function generateTwitterCardMeta(
  config: SiteConfig,
  cardType: "summary" | "summary_large_image" | "app" | "player" = "summary_large_image",
): MetaTags[] {
  return [
    { name: "twitter:card", content: cardType },
    { name: "twitter:title", content: config.title },
    { name: "twitter:description", content: config.description },
    { name: "twitter:image", content: `${config.url}${config.image}` },
    ...(config.twitter
      ? [{ name: "twitter:site", content: config.twitter } as MetaTags]
      : []),
  ];
}

/**
 * Generate favicon and app icon links
 */
export function generateFaviconLinks(): LinkTag[] {
  return [
    { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    { rel: "mask-icon", href: "/favicon.svg", color: "#000000" },
    { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    { rel: "manifest", href: "/manifest.webmanifest" },
  ];
}

/**
 * Generate theme meta tags
 */
export function generateThemeMeta(
  themeColor = "#ffffff",
  colorScheme: "light" | "dark" | "light dark" = "light dark",
): MetaTags[] {
  return [
    { name: "theme-color", content: themeColor },
    { name: "color-scheme", content: colorScheme },
  ];
}

/**
 * Generate canonical URL link
 */
export function generateCanonicalLink(url: string): LinkTag {
  return { rel: "canonical", href: url };
}

/**
 * Generate JSON-LD structured data for WebSite
 */
export function generateWebSiteSchema(config: SiteConfig): ScriptTag {
  return {
    type: "application/ld+json",
    innerHTML: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: config.name,
      url: config.url,
      description: config.description,
      ...(config.github
        ? {
            sameAs: [config.github, ...(config.twitter ? [`https://twitter.com/${config.twitter}`] : [])],
          }
        : {}),
    }),
  };
}

/**
 * Generate JSON-LD structured data for SoftwareSourceCode
 */
export function generateSoftwareSchema(config: SiteConfig): ScriptTag {
  return {
    type: "application/ld+json",
    innerHTML: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: config.name,
      description: config.description,
      url: config.url,
      codeRepository: config.github,
      programmingLanguage: ["TypeScript", "React", "JavaScript"],
      runtimePlatform: ["Node.js", "Browser"],
      applicationCategory: "DeveloperApplication",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      license: config.github ? `${config.github}/blob/main/LICENSE` : undefined,
    }),
  };
}

/**
 * Generate JSON-LD structured data for Article/Blog post
 */
export function generateArticleSchema(
  title: string,
  description: string,
  url: string,
  publishedTime: string,
  author: string,
): ScriptTag {
  return {
    type: "application/ld+json",
    innerHTML: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description,
      url,
      datePublished: publishedTime,
      author: {
        "@type": "Person",
        name: author,
      },
    }),
  };
}

/**
 * Generate complete head configuration for root route
 */
export function generateRootHead(config: SiteConfig): HeadConfig {
  return {
    meta: [
      ...generateSeoMeta(config),
      ...generateOpenGraphMeta(config),
      ...generateTwitterCardMeta(config),
      ...generateThemeMeta(),
    ],
    links: [...generateFaviconLinks(), generateCanonicalLink(config.url)],
    scripts: [generateWebSiteSchema(config)],
  };
}

/**
 * Generate page head configuration (for individual pages)
 */
export function generatePageHead(
  config: SiteConfig,
  options: {
    title?: string;
    description?: string;
    url?: string;
    ogType?: "website" | "article" | "product";
    noindex?: boolean;
  } = {},
): HeadConfig {
  const title = options.title ?? config.title;
  const description = options.description ?? config.description;
  const url = options.url ?? config.url;

  const meta: MetaTags[] = [
    { name: "title", content: title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: options.ogType ?? "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: `${config.url}${config.image}` },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: `${config.url}${config.image}` },
  ];

  if (options.noindex) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
  }

  return {
    meta,
    links: [generateCanonicalLink(url)],
  };
}
