import { createFormatter as createUseIntlFormatter } from "use-intl/core";

import { formats, resolveIntlOptions } from "./formats.js";
import type { Locale } from "./types.js";

export type Formatter = ReturnType<typeof createUseIntlFormatter>;
export type FormatterOptions = Omit<
  Parameters<typeof createUseIntlFormatter>[0],
  "_cache" | "_formatters" | "locale"
> & { locale: Locale };

export function createFormatter({ locale, ...options }: FormatterOptions): Formatter {
  return createUseIntlFormatter({ locale, ...resolveIntlOptions({ formats, ...options }) });
}
