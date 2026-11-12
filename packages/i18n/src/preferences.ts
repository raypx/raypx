import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "./constants.js";
import { isLocale, matchLocale } from "./locale.js";
import type { Locale } from "./types.js";

export type LocalePreference = Locale | "system";
export const LOCALE_PREFERENCE_KEY = LOCALE_STORAGE_KEY;
export function parseLocalePreference(value: unknown): LocalePreference {
  return typeof value === "string" && isLocale(value) ? value : "system";
}
export function resolveLocalePreference(
  preference: LocalePreference,
  systemLocales: readonly string[] = [],
): Locale {
  if (preference !== "system") {
    if (!isLocale(preference)) throw new TypeError("Unsupported locale preference");
    return preference;
  }
  return matchLocale(systemLocales) ?? DEFAULT_LOCALE;
}
