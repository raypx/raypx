import { Toaster } from "@raypx/ui/components/sonner";
import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { siteConfig } from "~/config/site";
import appCss from "~/styles/globals.css?url";

type RootRouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RootRouterContext>()({
  head: async () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: siteConfig.description },
      { name: "keywords", content: siteConfig.keywords.join(", ") },
      { name: "author", content: siteConfig.author },
      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: siteConfig.name },
      { property: "og:title", content: siteConfig.title },
      { property: "og:description", content: siteConfig.description },
      { property: "og:url", content: siteConfig.url },
      { property: "og:image", content: `${siteConfig.url}${siteConfig.image}` },
      // Twitter Card
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: siteConfig.title },
      { name: "twitter:description", content: siteConfig.description },
      { name: "twitter:image", content: `${siteConfig.url}${siteConfig.image}` },
      // Favicon
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "mask-icon", href: "/favicon.svg", color: "#000000" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      // Theme Color
      { name: "theme-color", content: "#ffffff" },
      { name: "color-scheme", content: "light dark" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: siteConfig.url },
    ],
    scripts: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          url: siteConfig.url,
          description: siteConfig.description,
        }),
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="system">
          <Outlet />
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
