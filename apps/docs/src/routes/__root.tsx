import { RootProvider } from "@fumadocs/base-ui/provider/tanstack";
import { Toaster } from "@raypx/ui/components/sonner";
import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TanstackProvider } from "fumadocs-core/framework/tanstack";
import { DefaultCatchBoundary } from "~/components/default-catch-boundary";
import Loading from "~/components/layout/loading";
import NotFound from "~/components/layout/not-found";
import { siteConfig } from "~/config/site";
import { generateRootHead } from "@raypx/seo";
import appCss from "~/styles/globals.css?url";

export const Route = createRootRoute({
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
  notFoundComponent: () => <NotFoundComponent />,
  errorComponent: (props) => (
    <RootDocument>
      <DefaultCatchBoundary {...props} />
    </RootDocument>
  ),
  pendingComponent: () => <Loading />,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html dir="ltr" lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="system">
          <TanstackProvider>
            <RootProvider>
              <a
                href="#main-content"
                className="focus-visible:ring-ring pointer-events-none fixed left-4 top-4 z-50 -translate-y-full rounded-md bg-primary px-3 py-2 text-primary-foreground opacity-0 transition-transform focus-visible:translate-y-0 focus-visible:opacity-100"
              >
                Skip to main content
              </a>
              <div id="main-content" tabIndex={-1}>
                {children}
              </div>
              <Toaster />
            </RootProvider>
          </TanstackProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundComponent() {
  return (
    <div>
      <NotFound />
    </div>
  );
}
