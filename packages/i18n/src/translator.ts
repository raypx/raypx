import { createTranslator as createIntlTranslator } from "@raypx/intl";
import type { CreateTranslatorOptions as IntlTranslatorOptions, Translator } from "@raypx/intl";
import type { Locale } from "./types.js";

export type { Translator } from "@raypx/intl";
export type CreateTranslatorOptions = Omit<IntlTranslatorOptions, "locale"> & { locale: Locale };

export function createTranslator(options: CreateTranslatorOptions): Translator {
  return createIntlTranslator(options);
}
