import { createFormatter as createIntlFormatter } from "@voidmix/intl";
import type { Formatter, FormatterOptions as IntlFormatterOptions } from "@voidmix/intl";
import type { Locale } from "./types.js";

export type { Formatter } from "@voidmix/intl";
export type FormatterOptions = Omit<IntlFormatterOptions, "locale"> & { locale: Locale };

export function createFormatter(options: FormatterOptions): Formatter {
  return createIntlFormatter({ timeZone: "UTC", ...options });
}
