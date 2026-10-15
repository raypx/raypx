import { createIntlServer } from "@voidmix/intl/server";
import { localeRuntime } from "./runtime";

export const { resolveRequestLocale, resolveRequestLocaleHint, resolveConfiguredLocale } =
  createIntlServer(localeRuntime);
export { createTranslator, type CreateTranslatorOptions, type Translator } from "./translator";
export { getLocaleCookie } from "./cookie";
export { resolveLocale } from "./resolve";
export type { Locale } from "./types";
