import { createFileRoute, Outlet, redirect, useParams } from "@tanstack/react-router";
import { TanstackProvider } from "fumadocs-core/framework/tanstack";
import type { I18nConfig } from "fumadocs-core/i18n";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { docsI18nConfig } from "@/lib/docs/i18n";

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
  const { lang = docsI18nConfig.defaultLanguage } = useParams({ strict: false });

  return (
    <TanstackProvider>
      <RootProvider i18n={provider(lang)}>
        <Outlet />
      </RootProvider>
    </TanstackProvider>
  );
}

export const Route = createFileRoute("/{-$lang}/docs")({
  component: DocsLayout,
});
