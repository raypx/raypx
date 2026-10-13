import type { ComponentProps } from "react";
import { createIntlClient } from "@raypx/intl/client";
import { localeRuntime } from "./runtime.js";

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
export { DEFAULT_LOCALE } from "./constants.js";
export { createBrowserLocaleStorage, createLocalStorageLocaleStorage } from "./client/storage.js";
export type {
  Locale,
  LocaleStorage,
  MessageCatalog,
  MessageTree,
  MessagesByLocale,
  LocaleCatalogLoader,
} from "./types.js";
