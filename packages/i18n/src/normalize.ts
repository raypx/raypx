import { SUPPORTED_LOCALES } from "./constants.js";
import type { Locale } from "./types.js";

export function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replaceAll("_", "-");
  if (!normalized) return undefined;
  const language = normalized.split("-")[0]?.toLowerCase();
  return language && isLocale(language) ? language : undefined;
}
