import type { ReactNode } from "react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { ThemeProvider, ThemeScript } from "@raypx/ui/theme/client";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { resolveLocalePreference } from "@raypx/i18n/preferences";
import { loadPreferences } from "../preferences";
import { WebShell } from "../components/web-shell";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
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
  component: WebShell,
});

function RootDocument({ children }: { children: ReactNode }) {
  const preferences = Route.useLoaderData();
  return (
    <html
      lang={resolveLocalePreference(preferences.locale, preferences.systemLocale)}
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
            initialSystemLocale={preferences.systemLocale}
          >
            {children}
          </BrowserLanguageProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
