import { createIntlClient } from "@raypx-kit/intl/client";
import { intlDefaults } from "./formats.js";
import { localeRuntime } from "./runtime.js";
import type en from "../locales/en/index.js";

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
