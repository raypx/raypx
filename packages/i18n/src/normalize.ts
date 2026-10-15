import { localeRuntime } from "./runtime";
import type { Locale } from "./types";

export function isLocale(value: string): value is Locale {
  return localeRuntime.isLocale(value);
}
export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  return localeRuntime.normalizeLocale(value);
}
