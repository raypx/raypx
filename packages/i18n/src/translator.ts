import { createTranslator as createIntlTranslator } from "@voidmix/intl";
import type { CreateTranslatorOptions as IntlTranslatorOptions, Translator } from "@voidmix/intl";
import type { Locale } from "./types.js";

export type { Translator } from "@voidmix/intl";
export type CreateTranslatorOptions = Omit<IntlTranslatorOptions, "locale"> & { locale: Locale };

export function createTranslator(options: CreateTranslatorOptions): Translator {
  return createIntlTranslator(options);
}
