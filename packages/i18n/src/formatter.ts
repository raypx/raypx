import { createFormatter as createIntlFormatter } from "@raypx/intl";
import type { Formatter, FormatterOptions } from "@raypx/intl";
import type { Locale } from "./types.js";

export type { Formatter, FormatterOptions } from "@raypx/intl";

export function createFormatter(locale: Locale, options: FormatterOptions = {}): Formatter {
  return createIntlFormatter(locale, options);
}
