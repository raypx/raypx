import { localeRuntime } from "./runtime";
import type { LocaleSource } from "./types";

export function resolveLocale(source?: LocaleSource) {
  return localeRuntime.resolveLocale(source);
}
