import { localeRuntime } from "./runtime.ts";
import type { LocaleSource } from "./types.ts";

export function resolveLocale(source?: LocaleSource) {
  return localeRuntime.resolveLocale(source);
}
