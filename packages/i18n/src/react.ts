import { createIntlClient } from "./intl/client.js";
import { intlDefaults } from "./formats.js";
import { localeRuntime } from "./runtime.js";
import type { DynamicMessages } from "./types.js";

// This instance alone owns language preference context. Typed translation bindings
// read the same SDK messages context without mounting another language provider.
export const intlClient = createIntlClient()(localeRuntime, intlDefaults);

export function createTranslations<M extends DynamicMessages>() {
  return createIntlClient<M>()(localeRuntime, intlDefaults).useTranslations;
}
export const {
  IntlProvider,
  useLocale,
  useFormatter,
  useNow,
  useTimeZone,
  useMessages,
  useLanguagePreference,
} = intlClient;
