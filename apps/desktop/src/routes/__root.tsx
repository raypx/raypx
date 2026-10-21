import { useEffect, type ReactNode } from "react";
import { ClientOnly, HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { DesktopShell, ShellSkeleton } from "../shell";
import { DesktopPreferencesProvider, desktopThemeScript } from "../preferences";
import { SessionGate } from "../features/auth/components/session-gate";
import { RemoteCoordinator } from "../features/tasks/coordinator";
import { getBridge, isDesktop } from "../lib/desktop";
import appCss from "../styles.css?url";

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
        {/* oxlint-disable-next-line react/no-danger -- Static first-paint theme script interpolates only application-owned storage keys. */}
        <script dangerouslySetInnerHTML={{ __html: desktopThemeScript }} />
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
  }, []);
  return (
    <ClientOnly fallback={<ShellSkeleton />}>
      <DesktopPreferencesProvider>
        <RemoteCoordinator />
        <SessionGate>
          <DesktopShell />
        </SessionGate>
      </DesktopPreferencesProvider>
    </ClientOnly>
  );
}
