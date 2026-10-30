import { lazy, Suspense, type ReactNode } from "react";
import {
  ClientOnly,
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ThemeProvider, ThemeScript, themeMeta } from "@raypx/ui/themes";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { resolveLocalePreference } from "@raypx/i18n/preferences";
import { loadPreferences } from "../preferences";
import { AppAnalytics } from "../features/analytics/provider";
import appCss from "../styles.css?url";

const Devtools = import.meta.env.DEV
  ? lazy(() => import("@raypx/devtools").then((module) => ({ default: module.DevtoolsBridge })))
  : null;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => loadPreferences(),
  // After hydration the providers own preferences; navigation never reloads them.
  staleTime: Infinity,
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      ...themeMeta,
      { title: "Raypx" },
    ],
    links: [
      { rel: "icon", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  const preferences = Route.useLoaderData();
  return (
    <html
      lang={resolveLocalePreference(preferences.locale, preferences.systemLocales)}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        {/* "system" themes resolve from the media query before first paint. */}
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider initialTheme={preferences.theme}>
          <BrowserLanguageProvider
            initialPreference={preferences.locale}
            initialSystemLocales={preferences.systemLocales}
          >
            <AppAnalytics>
              {children}
              {Devtools && (
                <ClientOnly fallback={null}>
                  <Suspense fallback={null}>
                    <Devtools surface="web" stylesheetUrl={appCss} />
                  </Suspense>
                </ClientOnly>
              )}
            </AppAnalytics>
          </BrowserLanguageProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
