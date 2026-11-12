import { parseAcceptLanguage } from "./accept-language.js";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
} from "./constants.js";
import type { Locale, LocaleSource } from "./types.js";

function canonicalLocale(value: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(value.trim().replaceAll("_", "-"))[0]?.toLowerCase();
  } catch {
    return undefined;
  }
}

const canonicalLocales = new Map(
  SUPPORTED_LOCALES.map((locale) => [canonicalLocale(locale), locale]),
);

export function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  let candidate = canonicalLocale(value);
  while (candidate) {
    const match = canonicalLocales.get(candidate);
    if (match) return match;
    const boundary = candidate.lastIndexOf("-");
    if (boundary < 0) break;
    candidate = candidate.slice(0, boundary);
    // RFC 4647 lookup also removes extension singletons after truncation.
    if (candidate.length >= 2 && candidate.at(-2) === "-") {
      candidate = candidate.slice(0, -2);
    }
  }
  return undefined;
}

export function matchLocale(candidates: readonly string[]): Locale | undefined {
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale !== undefined) return locale;
  }
  return undefined;
}

export function getLocaleCookie(cookieHeader: string | null | undefined): Locale | undefined {
  if (!cookieHeader) return undefined;
  const prefix = `${LOCALE_COOKIE_NAME}=`;
  for (const part of cookieHeader.split(";")) {
    const cookie = part.trim();
    if (!cookie.startsWith(prefix)) continue;
    try {
      const locale = normalizeLocale(decodeURIComponent(cookie.slice(prefix.length)));
      if (locale) return locale;
    } catch {
      // A malformed duplicate does not hide a later valid cookie.
    }
  }
  return undefined;
}

export function serializeLocaleCookie(locale: Locale, options?: { secure?: boolean }): string {
  if (!isLocale(locale)) throw new TypeError("Cannot persist an unsupported locale");
  return [
    `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}`,
    "Path=/",
    `Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    ...((options === undefined ? {} : options).secure ? ["Secure"] : []),
  ].join("; ");
}

export function resolveLocale(source?: LocaleSource): Locale {
  const { cookieLocale, acceptLanguage, fallbackLocale } = source === undefined ? {} : source;
  if (fallbackLocale !== undefined && !isLocale(fallbackLocale)) {
    throw new TypeError("Fallback locale must be one of the supported locales");
  }
  return (
    normalizeLocale(cookieLocale) ??
    matchLocale(parseAcceptLanguage(acceptLanguage).map((preference) => preference.locale)) ??
    fallbackLocale ??
    DEFAULT_LOCALE
  );
}
