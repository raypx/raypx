import { Analytics } from "@raypx/analytics";
import { I18nProvider } from "@raypx/i18n/client";
import { getLocale } from "@raypx/i18n/runtime";
import { Toaster } from "@raypx/ui/components/sonner";
import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import Loading from "@/components/layout/loading";
import NotFound from "@/components/layout/not-found";
import appCss from "@/styles/globals.css?url";

export const Route = createRootRoute({
  head: async () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Raypx",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
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
  const locale = getLocale();
  return (
    <html dir="ltr" lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <I18nProvider locale={locale}>
          <ThemeProvider defaultTheme="system">
            {children}
            <Toaster />
          </ThemeProvider>
        </I18nProvider>
        <Scripts />
        {process.env.NODE_ENV === "production" && <Analytics />}
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
