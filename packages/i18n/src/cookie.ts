import { LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALE_COOKIE_NAME } from "./constants.js";
import { normalizeLocale } from "./normalize.js";
import type { Locale } from "./types.js";

export function getLocaleCookie(cookieHeader: string | null | undefined): Locale | undefined {
  if (!cookieHeader) return undefined;
  return getNamedLocaleCookie(cookieHeader, LOCALE_COOKIE_NAME);
}

function getNamedLocaleCookie(cookieHeader: string, name: string): Locale | undefined {
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const encoded = trimmed.slice(prefix.length);
    if (!encoded) continue;
    try {
      const locale = normalizeLocale(decodeURIComponent(encoded));
      if (locale) return locale;
    } catch {
      // Ignore malformed values and continue searching for a valid duplicate.
    }
  }
  return undefined;
}

export function serializeLocaleCookie(locale: Locale, options: { secure?: boolean } = {}) {
  return [
    `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}`,
    "Path=/",
    `Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    options.secure ? "Secure" : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join("; ");
}
