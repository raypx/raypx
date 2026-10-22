import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getLocaleCookie, parseAcceptLanguage } from "@raypx/i18n";
import type { LocalePreference } from "@raypx/i18n/preferences";
import { readThemeCookie, type UserTheme } from "@raypx/ui/themes/config";

export interface DevicePreferences {
  theme: UserTheme;
  locale: LocalePreference;
  systemLocales: readonly string[];
}

/** Device preferences travel as cookies so the first render already matches them. */
export function readRequestPreferences(headers: Pick<Headers, "get">): DevicePreferences {
  const cookie = headers.get("cookie");
  const systemLocales = parseAcceptLanguage(headers.get("accept-language")).map(
    (item) => item.locale,
  );
  return {
    theme: readThemeCookie(cookie) ?? "system",
    locale: getLocaleCookie(cookie) ?? "system",
    systemLocales,
  };
}
export const loadPreferences = createIsomorphicFn()
  .server(() => readRequestPreferences(getRequestHeaders()))
  .client(() =>
    readRequestPreferences(
      new Headers({
        cookie: document.cookie,
        "accept-language": navigator.languages.join(",") || navigator.language,
      }),
    ),
  );
