import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { DEFAULT_LOCALE, getLocaleCookie, normalizeLocale, parseAcceptLanguage } from "@raypx/i18n";
import type { LocalePreference } from "@raypx/i18n/preferences";
import { THEME_STORAGE_KEY, parseTheme, type UserTheme } from "@raypx/ui/theme";

export interface DevicePreferences {
  theme: UserTheme;
  locale: LocalePreference;
  systemLocale: string;
}

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return null;
    }
  }
  return null;
}
/** Device preferences travel as cookies so the first render already matches them. */
export function readRequestPreferences(headers: Pick<Headers, "get">): DevicePreferences {
  const cookie = headers.get("cookie");
  const systemLocale =
    parseAcceptLanguage(headers.get("accept-language"))
      .map((item) => normalizeLocale(item.locale))
      .find((locale) => locale !== undefined) ?? DEFAULT_LOCALE;
  return {
    theme: parseTheme(readCookie(cookie, THEME_STORAGE_KEY), "system"),
    locale: getLocaleCookie(cookie) ?? "system",
    systemLocale,
  };
}
export const loadPreferences = createIsomorphicFn()
  .server(() => readRequestPreferences(getRequestHeaders()))
  .client(() =>
    readRequestPreferences(
      new Headers({ cookie: document.cookie, "accept-language": navigator.language }),
    ),
  );
