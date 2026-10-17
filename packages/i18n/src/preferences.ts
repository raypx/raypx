import { LOCALE_STORAGE_KEY } from "./constants.js";
import { localeRuntime } from "./runtime.js";
import type { Locale } from "./types.js";

export type LocalePreference = Locale | "system";
export const LOCALE_PREFERENCE_KEY = LOCALE_STORAGE_KEY;
export function parseLocalePreference(value: unknown): LocalePreference {
  return localeRuntime.parsePreference(value);
}
export function resolveLocalePreference(
  preference: LocalePreference,
  systemLocales: readonly string[] = [],
): Locale {
  return localeRuntime.resolvePreference(preference, systemLocales);
}
