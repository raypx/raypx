import type { Metadata } from "next";
import "~/styles/globals.css";
import { defineI18nUI } from "@fumadocs/base-ui/i18n";
import { DocsLayout } from "@fumadocs/base-ui/layouts/docs";
import { RootProvider } from "@fumadocs/base-ui/provider/next";
import { getMessages } from "next-intl/server";
import { i18n } from "~/lib/i18n";
import { source } from "~/lib/source";
import { Providers } from "../providers";

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

export const metadata: Metadata = {
  title: "Raypx Docs",
  description: "Raypx Documentation",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers locale={locale} messages={messages}>
          <RootProvider
            i18n={provider(locale)}
            search={{ enabled: true, options: { api: "/docs/api/search" } }}
          >
            <DocsLayout
              i18n={i18n}
              nav={{
                title: <a href="/">Raypx</a>,
              }}
              sidebar={{
                prefetch: false,
              }}
              tree={source.getPageTree(locale)}
            >
              {children}
            </DocsLayout>
          </RootProvider>
        </Providers>
      </body>
    </html>
  );
}
