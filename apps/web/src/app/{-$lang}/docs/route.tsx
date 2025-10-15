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

function resolveRedirect(lang: string | undefined, config: I18nConfig) {
  const to = "/{-$lang}/docs";
  const { hideLocale, defaultLanguage, languages } = config;

  if (hideLocale === "always") {
    return lang ? { to, params: { lang: undefined } } : null;
  }

  if (hideLocale === "never") {
    const validLang = lang && languages.includes(lang) ? lang : defaultLanguage;
    return lang === validLang ? null : { to, params: { lang: validLang } };
  }

  return lang === defaultLanguage ? { to, params: { lang: undefined } } : null;
}

export const Route = createFileRoute("/{-$lang}/docs")({
  component: DocsLayout,
  beforeLoad(ctx) {
    const { lang } = ctx.params;
    const result = resolveRedirect(lang, docsI18nConfig);
    if (result) throw redirect(result);
  },
});
