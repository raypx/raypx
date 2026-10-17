import { localeRuntime } from "./runtime.js";
import type { Locale } from "./types.js";

export function isLocale(value: string): value is Locale {
  return localeRuntime.isLocale(value);
}
export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  return localeRuntime.normalizeLocale(value);
}
export function matchLocale(candidates: readonly string[]): Locale | undefined {
  return localeRuntime.matchLocale(candidates);
}
