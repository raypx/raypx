import { createRootRoute, HeadContent, Outlet, Scripts, useParams } from "@tanstack/react-router";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import type * as React from "react";
import appCss from "@/styles/app.css?url";
import { i18n } from "../lib/i18n";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Fumadocs on TanStack Start",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

const { provider } = defineI18nUI(i18n, {
  translations: {
    en: {
      displayName: "English",
    },
    zh: {
      displayName: "中文",
      search: "搜索文档",
    },
  },
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { locale = i18n.defaultLanguage } = useParams({ strict: false });

  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          i18n={provider(locale)}
          search={{ enabled: true, options: { api: "/docs/api/search" } }}
        >
          {children}
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
