import { createIntlClient } from "@raypx-kit/intl/client";
import { intlDefaults } from "./formats.ts";
import { localeRuntime } from "./runtime.ts";
import type en from "./messages/en.ts";

export const intlClient = createIntlClient<typeof en>()(localeRuntime, intlDefaults);
export const {
  IntlProvider,
  useLocale,
  useTranslations,
  useFormatter,
  useNow,
  useTimeZone,
  useMessages,
  useLanguagePreference,
} = intlClient;
