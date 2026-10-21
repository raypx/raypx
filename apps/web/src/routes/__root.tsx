import type { ReactNode } from "react";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ThemeProvider, ThemeScript } from "@raypx/ui/theme/client";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { resolveLocalePreference } from "@raypx/i18n/preferences";
import { loadPreferences } from "../preferences";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => loadPreferences(),
  // After hydration the providers own preferences; navigation never reloads them.
  staleTime: Infinity,
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { name: "color-scheme", content: "light dark" },
      { name: "theme-color", content: "#ffffff" },
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
        <ThemeProvider disableScript initialTheme={preferences.theme}>
          <BrowserLanguageProvider
            initialPreference={preferences.locale}
            initialSystemLocales={preferences.systemLocales}
          >
            {children}
          </BrowserLanguageProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
