import { parseAcceptLanguage } from "./accept-language.js";
import { DEFAULT_LOCALE } from "./constants.js";
import { normalizeLocale } from "./normalize.js";
import type { Locale, LocaleSource } from "./types.js";

export function resolveLocale({
  cookieLocale,
  acceptLanguage,
  fallbackLocale = DEFAULT_LOCALE,
}: LocaleSource = {}): Locale {
  return (
    normalizeLocale(cookieLocale) ??
    parseAcceptLanguage(acceptLanguage)
      .map((preference) => normalizeLocale(preference.locale))
      .find((locale): locale is Locale => locale !== undefined) ??
    fallbackLocale
  );
}
