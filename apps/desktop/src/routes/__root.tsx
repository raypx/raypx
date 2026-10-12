import { TooltipProvider } from "@voidmix/ui/components/ui/tooltip";
import { HeadContent, Navigate, Scripts, createRootRoute } from "@tanstack/react-router";
import { normalizeLocale } from "@voidmix/i18n";
import {
  I18nProvider,
  createLocalStorageLocaleStorage,
  useLocale,
  useSetLocale,
} from "@voidmix/i18n/client";
import { useEffect, type ReactNode } from "react";

import { DesktopShell } from "../features/shell/desktop-shell";
import { messages } from "../i18n/messages";
import appCss from "../styles.css?url";

const localeStorage = createLocalStorageLocaleStorage();

export const Route = createRootRoute({
  component: DesktopShell,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0, viewport-fit=cover",
      },
      { name: "theme-color", content: "#171717" },
      { title: "VoidMix" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => <Navigate to="/" replace />,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <I18nProvider
      locale="en"
      messages={messages}
      storage={localeStorage}
      onLocaleChange={(locale) => {
        document.documentElement.lang = locale;
      }}
    >
      <LocalizedDocument>{children}</LocalizedDocument>
    </I18nProvider>
  );
}

function LocalizedDocument({ children }: { children: ReactNode }) {
  const locale = useLocale();

  return (
    <html dir="ltr" lang={locale} className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreferredLocaleBootstrap />
        <TooltipProvider delay={300}>{children}</TooltipProvider>
        <Scripts />
      </body>
    </html>
  );
}

function PreferredLocaleBootstrap() {
  const locale = useLocale();
  const setLocale = useSetLocale();

  useEffect(() => {
    const preferredLocale =
      localeStorage.read() ?? normalizeLocale(globalThis.navigator?.language) ?? "en";

    if (preferredLocale !== locale) {
      void setLocale(preferredLocale);
    }
  }, [locale, setLocale]);

  return null;
}
