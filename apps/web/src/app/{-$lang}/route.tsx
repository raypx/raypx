import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { I18nConfig } from "fumadocs-core/i18n";
import { docsI18nConfig } from "../../lib/docs/i18n";
import { getUserLanguage } from "../../lib/i18n/server";

function resolveRedirect(routeId: string, lang: string | undefined, config: I18nConfig) {
  // const to = "/{-$lang}/docs";
  const to = routeId;
  const { hideLocale, defaultLanguage, languages } = config;

  console.log("hideLocale", hideLocale);
  console.log("lang", lang);
  if (hideLocale === "always") {
    return lang ? { to, params: { lang: undefined } } : null;
  }

  if (hideLocale === "never") {
    const validLang = lang && languages.includes(lang) ? lang : defaultLanguage;
    return lang === validLang ? null : { to, params: { lang: validLang } };
  }

  return lang === defaultLanguage ? { to, params: { lang: undefined } } : null;
}

export const Route = createFileRoute("/{-$lang}")({
  component: RouteComponent,
  beforeLoad: async (ctx) => {
    const route = ctx.matches[ctx.matches.length - 1]!;
    const routeId = route.routeId;
    if (routeId.startsWith(`/{-$lang}`)) {
      const result = resolveRedirect(
        ctx.matches[ctx.matches.length - 1]!.routeId,
        ctx.params.lang ?? docsI18nConfig.defaultLanguage,
        docsI18nConfig,
      );
      console.log("result", result);
      if (result) throw redirect(result);
    }
  },
});

function RouteComponent() {
  return <Outlet />;
}
