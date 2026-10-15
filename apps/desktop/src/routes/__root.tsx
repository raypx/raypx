import type { ReactNode } from "react";
import { ClientOnly, HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { ThemeProvider } from "@raypx/ui/theme/client";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { DesktopShell, ShellSkeleton } from "../shell";
import appCss from "../styles.css?url";

// Runs before paint. The native preload has already restored device preferences
// into localStorage, so the prerendered shell never flashes the wrong theme.
const preferenceScript = `(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t !== "light" && t !== "dark")
      t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.classList.add(t);
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
    var l = localStorage.getItem("raypx_locale");
    document.documentElement.lang =
      l === "zh" || (l !== "en" && navigator.language.toLowerCase().indexOf("zh") === 0)
        ? "zh"
        : "en";
  } catch (e) {}
})();`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { name: "color-scheme", content: "light dark" },
      { name: "theme-color", content: "#ffffff" },
      { title: "Raypx" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: preferenceScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Theme, language and the native bridge exist only in the WebView, never in the
// build-time prerender, so everything localized starts after hydration.
function RootComponent() {
  return (
    <ClientOnly fallback={<ShellSkeleton />}>
      <ThemeProvider disableScript>
        <BrowserLanguageProvider>
          <DesktopShell />
        </BrowserLanguageProvider>
      </ThemeProvider>
    </ClientOnly>
  );
}
