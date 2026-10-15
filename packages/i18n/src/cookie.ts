import { localeRuntime } from "./runtime";
import type { Locale } from "./types";

export function getLocaleCookie(header: string | null | undefined) {
  return localeRuntime.getLocaleCookie(header);
}
export function serializeLocaleCookie(
  locale: Locale,
  options?: Parameters<typeof localeRuntime.serializeLocaleCookie>[1],
) {
  return localeRuntime.serializeLocaleCookie(locale, options);
}
