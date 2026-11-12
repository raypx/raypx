import type { Locale } from "./types.js";

/** Normalize display text for substring search. Keep stored identifiers and equality unchanged. */
export function normalizeSearchText(value: string, locale?: Locale): string {
  const text = value.trim().normalize("NFKC");
  return locale === undefined ? text.toLowerCase() : text.toLocaleLowerCase(locale);
}
