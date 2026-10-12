import { parseAcceptLanguage } from "./accept-language.js";
import { getLocaleCookie } from "./cookie.js";
import { normalizeLocale } from "./normalize.js";
import { resolveLocale } from "./resolve.js";
export { createTranslator, type CreateTranslatorOptions, type Translator } from "./translator.js";
import type { Locale } from "./types.js";

export function resolveRequestLocale(headers: Headers, fallbackLocale?: Locale): Locale {
  return resolveRequestLocaleHint(headers) ?? fallbackLocale ?? resolveLocale();
}

/**
 * Returns only a locale explicitly supplied by the request. This is useful for
 * optional per-request values such as recipient mail language, where falling
 * back to `en` would incorrectly override a configured process default.
 */
export function resolveRequestLocaleHint(headers: Headers): Locale | undefined {
  const cookieLocale = getLocaleCookie(headers.get("cookie"));
  if (cookieLocale) return cookieLocale;

  return parseAcceptLanguage(headers.get("accept-language"))
    .map((preference) => normalizeLocale(preference.locale))
    .find((locale): locale is Locale => locale !== undefined);
}

export function resolveConfiguredLocale(
  value: string | undefined,
  fallbackLocale: Locale = "en",
): Locale {
  return resolveLocale({ ...(value ? { cookieLocale: value } : {}), fallbackLocale });
}

export { getLocaleCookie } from "./cookie.js";
export { resolveLocale } from "./resolve.js";
export type { Locale } from "./types.js";
