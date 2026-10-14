import { createFormatter as createIntlFormatter } from "@voidmix/intl";
import type { Formatter, FormatterOptions } from "@voidmix/intl";
import type { Locale } from "./types.js";

export type { Formatter, FormatterOptions } from "@voidmix/intl";

export function createFormatter(locale: Locale, options: FormatterOptions = {}): Formatter {
  return createIntlFormatter(locale, options);
}
