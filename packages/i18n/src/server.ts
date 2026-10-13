import { createIntlServer } from "@raypx/intl/server";
import { localeRuntime } from "./runtime.js";

export const { resolveRequestLocale, resolveRequestLocaleHint, resolveConfiguredLocale } =
  createIntlServer(localeRuntime);
export { createTranslator, type CreateTranslatorOptions, type Translator } from "./translator.js";
export { getLocaleCookie } from "./cookie.js";
export { resolveLocale } from "./resolve.js";
export type { Locale } from "./types.js";
