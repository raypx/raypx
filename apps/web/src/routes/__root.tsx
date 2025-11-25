import { AnalyticsProvider } from "@raypx/analytics";
import { type AnyAuthClient, AuthProvider } from "@raypx/auth";
import type { AppRouter } from "@raypx/trpc";
import { Toaster } from "@raypx/ui/components/sonner";
import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { DefaultCatchBoundary } from "~/components/default-catch-boundary";
import { Devtools } from "~/components/layout/devtools";
import Loading from "~/components/layout/loading";
import { NotFound } from "~/components/not-found";
import appCss from "~/styles/globals.css?url";

type RootRouterContext = {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
  auth?: {
    session: AnyAuthClient["$Infer"]["Session"] | null;
  };
};

export const Route = createRootRouteWithContext<RootRouterContext>()({
  head: async () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Raypx", description: "Raypx" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
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
        <AnalyticsProvider>
          <ThemeProvider defaultTheme="system">
            <AuthProvider navigate={() => {}} redirectTo="/" replace={() => {}}>
              {children}
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </AnalyticsProvider>
        <Devtools />
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundComponent() {
  return (
    <RootDocument>
      <NotFound />
    </RootDocument>
  );
}
