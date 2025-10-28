import { Analytics } from "@raypx/analytics";
import { AuthProvider } from "@raypx/auth";
import { I18nProvider } from "@raypx/i18n/client";
import { getLocale } from "@raypx/i18n/runtime";
import type { AppRouter } from "@raypx/trpc";
import { Toaster } from "@raypx/ui/components/sonner";
import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import { Devtools } from "@/components/layout/devtools";
import Loading from "@/components/layout/loading";
import NotFound from "@/components/layout/not-found";
import appCss from "@/styles/globals.css?url";

type RootRouterContext = {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
};

export const Route = createRootRouteWithContext<RootRouterContext>()({
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
            <AuthProvider navigate={() => {}} redirectTo="/" replace={() => {}}>
              {children}
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
        <Devtools />
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
