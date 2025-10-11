import { Analytics } from "@raypx/analytics";
import type { TRPCRouter } from "@raypx/trpc";
import { Toaster } from "@raypx/ui/components/sonner";
import { ThemeProvider } from "@raypx/ui/components/theme-provider";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useTranslation } from "react-i18next";
import { Devtools } from "@/components/layout/devtools";
import i18n, { syncLanguage } from "@/lib/i18n";
import { AVAILABLE_LANGUAGES } from "@/lib/i18n/constants";
import { getUserLanguage } from "@/lib/i18n/server";
import appCss from "@/styles/globals.css?url";

type RootRouterContext = {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<TRPCRouter>;
};

const initSsrApp = createServerFn({ method: "GET" }).handler(() => {
  return {
    language: getUserLanguage(),
  };
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
  loader: async () => {
    // Setup language and theme in SSR to prevent hydratation errors
    if (import.meta.env.SSR) {
      const { language } = await initSsrApp();
      i18n.changeLanguage(language);
    }
  },
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  syncLanguage(i18n.language);

  const languageConfig = AVAILABLE_LANGUAGES.find(({ key }) => key === i18n.language);

  return (
    <html dir={languageConfig?.dir ?? "ltr"} lang={i18n.language} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
        <Devtools />
        <Scripts />
        <Analytics />
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
