import { Analytics } from "@raypx/analytics";
import { ensureServerRequestContext, getServerRequestContext } from "@raypx/i18n/server-runtime";
import type { TRPCRouter } from "@raypx/trpc";
import { Toaster } from "@raypx/ui/components/sonner";
import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { createClientOnlyFn, createServerFn } from "@tanstack/react-start";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { i18n as I18nInstance } from "i18next";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { Devtools } from "@/components/layout/devtools";
import Loading from "@/components/layout/loading";
import i18n, { changeLanguage, createServerI18n, syncLanguage } from "@/lib/i18n";
import { AVAILABLE_LANGUAGES } from "@/lib/i18n/constants";
import { getUserLanguage } from "@/lib/i18n/server";
import appCss from "@/styles/globals.css?url";

const syncClientLanguage = createClientOnlyFn(async (language: string) => {
  await changeLanguage(language);
});

type RootRouterContext = {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<TRPCRouter>;
};

const initSsrApp = createServerFn({ method: "GET" }).handler(async () => {
  const language = getUserLanguage();
  const runtime = await ensureServerRequestContext();
  const instance = await createServerI18n(language);
  await syncLanguage(language);
  runtime?.setRequestI18n(instance);

  return { language };
});

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
  loader: async () => initSsrApp(),
  component: RootComponent,
  notFoundComponent: () => <NotFound />,
  errorComponent: () => <NotFound />,
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
  const { language } = Route.useLoaderData();
  const serverInstance = getServerRequestContext()?.getRequestI18n() ?? null;
  const activeI18n: I18nInstance = serverInstance ?? i18n;

  // Sync language before render to avoid hydration mismatch
  if (!serverInstance && activeI18n.language !== language) {
    void activeI18n.changeLanguage(language);
  }

  // Sync language on client side when language changes
  useEffect(() => {
    void syncClientLanguage(language);
  }, [language]);

  const languageConfig = AVAILABLE_LANGUAGES.find(({ key }) => key === language);

  return (
    <html dir={languageConfig?.dir ?? "ltr"} lang={language} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <I18nextProvider i18n={activeI18n}>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </I18nextProvider>
        <Devtools />
        <Scripts />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div>
      <h1>Not Found</h1>
    </div>
  );
}
