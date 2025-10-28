import { useLocale } from "@raypx/i18n/client";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { docsI18nConfig } from "@/lib/docs/i18n";
import appCss from "@/styles/mdx.css?url";

const translations = {
  zh: {
    displayName: "简体中文",
    search: "搜索",
  },
  en: {
    displayName: "English",
    search: "Search",
  },
};

const { provider } = defineI18nUI(docsI18nConfig, { translations });

function DocsLayout() {
  const { locale, setLocale } = useLocale();

  return (
    <RootProvider
      i18n={{
        ...provider(locale),
        onLocaleChange(v) {
          setLocale(v);
        },
      }}
    >
      <Outlet />
    </RootProvider>
  );
}

export const Route = createFileRoute("/docs")({
  component: DocsLayout,
  head: async () => ({
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
});
