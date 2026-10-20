import type { ComponentProps } from "react";
import { createIntlClient } from "@raypx-kit/intl/client";
import { localeRuntime } from "./runtime.js";
import type en from "./messages/en.js";

export const intlClient = createIntlClient<typeof en>()(localeRuntime, { timeZone: "UTC" });
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
export type IntlProviderProps = ComponentProps<typeof IntlProvider>;
