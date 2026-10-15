import type { ComponentProps } from "react";
import { createIntlClient } from "@voidmix/intl/client";
import { localeRuntime } from "./runtime";

export const {
  LocaleProvider,
  I18nProvider,
  AsyncI18nProvider,
  useLocale,
  useSetLocale,
  useTranslations,
  useFormatter,
} = createIntlClient(localeRuntime);
export type LocaleProviderProps = ComponentProps<typeof LocaleProvider>;
export type I18nProviderProps = ComponentProps<typeof I18nProvider>;
export type AsyncI18nProviderProps = ComponentProps<typeof AsyncI18nProvider>;
