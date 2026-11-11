import type { CatalogShape, LocaleSource as IntlLocaleSource } from "@raypx-kit/intl/types";
import type { LOCALE_OPTIONS, SUPPORTED_LOCALES } from "./constants.js";
import type en from "./messages/en.js";

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleOption = (typeof LOCALE_OPTIONS)[number];
export type Messages = CatalogShape<typeof en>;
export type MessagesByLocale = Readonly<Record<Locale, Messages>>;
export type LocaleSource = IntlLocaleSource<Locale>;
export type {
  MessageTree,
  MessageCatalog,
  DynamicMessages,
  TranslationValue,
  TranslationValues,
  IntlRuntimeOptions,
  AcceptLanguagePreference,
  CatalogShape,
  MessageKey,
  NamespaceOf,
} from "@raypx-kit/intl/types";
