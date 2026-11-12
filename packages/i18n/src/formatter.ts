import { createFormatter as createIntlFormatter } from "./intl/formatter.js";
import type { Formatter, FormatterOptions as IntlFormatterOptions } from "./intl/formatter.js";
import { intlDefaults } from "./formats.js";
import type { Locale } from "./types.js";

export type { Formatter } from "./intl/formatter.js";
export type FormatterOptions = Omit<IntlFormatterOptions, "locale"> & { locale: Locale };

export function createFormatter(options: FormatterOptions): Formatter {
  return createIntlFormatter({ ...intlDefaults, ...options });
}
