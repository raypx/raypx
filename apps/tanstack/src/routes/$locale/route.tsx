import { defaultLocale, getIntlContext, isLocale } from "@raypx/intl";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { IntlProvider } from "@/lib/intl";
import { getAcceptLanguageHeaderServerFn } from "@/lib/intl-server";

export const Route = createFileRoute("/$locale")({
  beforeLoad: async ({ params, matches }) => {
    if (params.locale && !isLocale(params.locale)) {
      throw redirect({ to: "/$locale", params: { locale: undefined } });
    }

    const currentMatch = matches[matches.length - 1]?.pathname;
    if (params.locale === undefined) {
      const acceptLanguageHeader =
        typeof window === "undefined"
          ? await getAcceptLanguageHeaderServerFn()
          : navigator.languages;
      if (Array.isArray(acceptLanguageHeader)) {
        const preferredLocales = acceptLanguageHeader.filter(isLocale);
        const firstPreferredLocale = preferredLocales[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (firstPreferredLocale && firstPreferredLocale !== defaultLocale) {
          throw redirect({
            to: currentMatch ? `/$locale/${currentMatch}` : "/$locale",
            params: { locale: firstPreferredLocale },
          });
        }
      }
    }

    const intl = await getIntlContext(params.locale);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (intl.locale !== params.locale && intl.locale !== defaultLocale) {
      throw redirect({
        to: "/$locale",
        params: { locale: intl.locale },
      });
    }
    return {
      intl,
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <IntlProvider>
      <Outlet />
    </IntlProvider>
  );
}
