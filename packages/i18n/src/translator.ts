import { createTranslator as createIntlTranslator } from "use-intl/core";

import { formats as defaultFormats } from "./formats.js";
import type { IntlRuntimeOptions, Locale, MessageCatalog, TranslationValues } from "./types.js";

export type Translator = (key: string, values?: TranslationValues) => string;

export type CreateTranslatorOptions = {
  locale: Locale;
  messages: MessageCatalog;
  namespace?: string;
  timeZone?: string;
  formats?: IntlRuntimeOptions["formats"];
};

export function createTranslator({
  locale,
  messages,
  namespace,
  timeZone = "UTC",
  formats = defaultFormats,
}: CreateTranslatorOptions): Translator {
  const translator = createIntlTranslator({
    locale,
    messages,
    ...(namespace ? { namespace } : {}),
    timeZone,
    formats: formats as never,
  });

  return (key, values) => (translator as unknown as Translator)(key, values);
}
