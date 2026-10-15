import { normalizeLocale } from "./normalize";
import type { Locale } from "./types";

export type LocalePreference = Locale | "system";
export const LOCALE_PREFERENCE_KEY = "raypx_locale";
export function parseLocalePreference(value: unknown): LocalePreference {
  return value === "en" || value === "zh" ? value : "system";
}
export function resolveLocalePreference(
  preference: LocalePreference,
  systemLocale?: string,
): Locale {
  return preference === "system" ? (normalizeLocale(systemLocale) ?? "en") : preference;
}
