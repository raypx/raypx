import { AnalyticsProvider } from "@raypx/analytics";
import type { ORPC } from "@raypx/api/orpc";
import { type AnyAuthClient, AuthProvider } from "@raypx/auth";
import { Toaster } from "@raypx/ui/components/sonner";
import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { DefaultCatchBoundary } from "~/components/default-catch-boundary";
import { Devtools } from "~/components/layout/devtools";
import Loading from "~/components/layout/loading";
import { NotFound } from "~/components/not-found";
import appCss from "~/styles/globals.css?url";

type RootRouterContext = {
  orpc: ORPC;
  queryClient: QueryClient;
  auth?: {
    session: AnyAuthClient["$Infer"]["Session"] | null;
  };
  request?: Request;
  headers?: Headers;
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
  const router = useRouter();

  return (
    <html dir="ltr" lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AnalyticsProvider>
          <ThemeProvider defaultTheme="system">
            <AuthProvider
              credentials={{
                rememberMe: true,
                username: true,
                confirmPassword: true,
                forgotPassword: true,
                passwordValidation: { minLength: 8, maxLength: 100 },
              }}
              navigate={(to) => router.navigate({ to })}
              redirectTo="/"
              replace={(to) => router.navigate({ to, replace: true })}
            >
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
