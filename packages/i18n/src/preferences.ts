import { LOCALE_STORAGE_KEY } from "./constants.ts";
import { localeRuntime } from "./runtime.ts";
import type { Locale } from "./types.ts";

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
