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
          <Outlet />
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
