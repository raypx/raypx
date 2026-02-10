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
import { generateRootHead } from "@raypx/seo";
import appCss from "~/styles/globals.css?url";

type RootRouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RootRouterContext>()({
  head: async () => {
    const seoHead = generateRootHead(siteConfig);

    return {
      meta: seoHead.meta,
      links: [
        { rel: "stylesheet", href: appCss },
        ...(seoHead.links ?? []),
      ],
      scripts: seoHead.scripts,
    };
  },
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
          <a
            href="#main-content"
            className="focus-visible:ring-ring pointer-events-none fixed left-4 top-4 z-50 -translate-y-full rounded-md bg-primary px-3 py-2 text-primary-foreground opacity-0 transition-transform focus-visible:translate-y-0 focus-visible:opacity-100"
          >
            Skip to main content
          </a>
          <div id="main-content" tabIndex={-1}>
            <Outlet />
          </div>
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
