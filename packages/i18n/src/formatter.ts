import { createFormatter as createIntlFormatter } from "@raypx-kit/intl";
import type { Formatter, FormatterOptions as IntlFormatterOptions } from "@raypx-kit/intl";
import { intlDefaults } from "./formats.js";
import type { Locale } from "./types.js";

export type { Formatter } from "@raypx-kit/intl";
export type FormatterOptions = Omit<IntlFormatterOptions, "locale"> & { locale: Locale };

export function createFormatter(options: FormatterOptions): Formatter {
  return createIntlFormatter({ ...intlDefaults, ...options });
}
