import { createFormatter as createUseIntlFormatter } from "use-intl/core";

import { resolveIntlOptions } from "./formats.js";

export type Formatter = ReturnType<typeof createUseIntlFormatter>;
export type FormatterOptions = Omit<
  Parameters<typeof createUseIntlFormatter>[0],
  "_cache" | "_formatters"
>;

export function createFormatter({ locale, ...options }: FormatterOptions): Formatter {
  return createUseIntlFormatter({ locale, ...resolveIntlOptions(options) });
}
