import type {
  CatalogShape,
  DynamicMessages,
  LocaleSource as IntlLocaleSource,
} from "./intl/types.js";
import type { LOCALE_OPTIONS, SUPPORTED_LOCALES } from "./constants.js";

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleOption = (typeof LOCALE_OPTIONS)[number];
export type Messages<M extends DynamicMessages = DynamicMessages> = CatalogShape<M>;
export type MessagesByLocale<M extends DynamicMessages = DynamicMessages> = Readonly<
  Record<Locale, Messages<M>>
>;
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
} from "./intl/types.js";
