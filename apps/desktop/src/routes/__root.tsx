import { useEffect, type ReactNode } from "react";
import { ClientOnly, HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { DesktopShell, ShellSkeleton } from "../components/shell";
import { ThemeScript, themeMeta } from "@raypx/ui/themes";
import { DesktopPreferencesProvider, desktopInitialThemeSource } from "../preferences";
import { SessionGate } from "../features/auth/components/session-gate";
import { RemoteCoordinator } from "../features/tasks/coordinator";
import { getBridge, isDesktop } from "../lib/desktop";
import { AppAnalytics } from "../features/analytics/provider";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      ...themeMeta,
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
        <ThemeScript initialThemeSource={desktopInitialThemeSource} />
      </head>
      <body className="h-dvh min-w-[800px] overflow-hidden">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Theme, language and the native bridge exist only in the WebView, never in the
// build-time prerender, so everything localized starts after hydration.
function RootComponent() {
  useEffect(() => {
    if (isDesktop()) void getBridge().catch(() => {});
    const open = (event: MouseEvent) => {
      if (!isDesktop() || event.defaultPrevented || event.button !== 0) return;
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || !/^https?:/.test(anchor.href)) return;
      event.preventDefault();
      void getBridge()
        .then((bridge) => bridge.request.openExternal({ url: anchor.href }))
        .catch(() => {});
    };
    document.addEventListener("click", open, true);
    return () => document.removeEventListener("click", open, true);
  }, []);
  return (
    <ClientOnly fallback={<ShellSkeleton />}>
      <DesktopPreferencesProvider>
        <AppAnalytics>
          <RemoteCoordinator />
          <SessionGate>
            <DesktopShell />
          </SessionGate>
        </AppAnalytics>
      </DesktopPreferencesProvider>
    </ClientOnly>
  );
}
