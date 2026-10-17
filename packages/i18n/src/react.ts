import type { ComponentProps } from "react";
import { createIntlClient } from "@voidmix/intl/client";
import { localeRuntime } from "./runtime.js";
import type en from "./messages/en.js";

export const {
  IntlProvider,
  useLocale,
  useTranslations,
  useFormatter,
  useNow,
  useTimeZone,
  useMessages,
} = createIntlClient<typeof en>()(localeRuntime, { timeZone: "UTC" });
export type IntlProviderProps = ComponentProps<typeof IntlProvider>;
