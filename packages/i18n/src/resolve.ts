import { localeRuntime } from "./runtime.js";
import type { LocaleSource } from "./types.js";

export function resolveLocale(source?: LocaleSource) {
  return localeRuntime.resolveLocale(source);
}
