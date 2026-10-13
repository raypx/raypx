import type {
  LocaleStorage as IntlLocaleStorage,
  LocaleCatalogLoader as IntlLocaleCatalogLoader,
  MessagesByLocale as IntlMessagesByLocale,
  LocaleSource as IntlLocaleSource,
} from "@raypx/intl/types";
import type { LOCALE_OPTIONS, SUPPORTED_LOCALES } from "./constants.js";

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleOption = (typeof LOCALE_OPTIONS)[number];
export type MessagesByLocale = IntlMessagesByLocale<Locale>;
export type LocaleStorage = IntlLocaleStorage<Locale>;
export type LocaleCatalogLoader = IntlLocaleCatalogLoader<Locale>;
export type LocaleSource = IntlLocaleSource<Locale>;
export type {
  MessageTree,
  MessageCatalog,
  TranslationValue,
  TranslationValues,
  IntlRuntimeOptions,
  AcceptLanguagePreference,
} from "@raypx/intl/types";
