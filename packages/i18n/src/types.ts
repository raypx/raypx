import type { LOCALE_OPTIONS, SUPPORTED_LOCALES } from "./constants.js";
import type { formats } from "./formats.js";

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleOption = (typeof LOCALE_OPTIONS)[number];

export type MessageTree = {
  readonly [key: string]: string | MessageTree;
};

export type MessagesByLocale = Record<Locale, MessageTree>;

/** Values accepted by ICU messages arriving from a trusted API error envelope. */
export type TranslationValue = string | number | boolean | Date | null;

export type TranslationValues = Record<string, TranslationValue>;

export type IntlRuntimeOptions = {
  timeZone?: string;
  formats?: typeof formats;
};

export type MessageCatalog = MessageTree;

export type LocaleCatalogLoader = (locale: Locale) => Promise<MessageCatalog>;

export type LocaleStorage = {
  read(): Locale | undefined;
  write(locale: Locale): void;
};

export type LocaleSource = {
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
  fallbackLocale?: Locale;
};

export type AcceptLanguagePreference = {
  locale: string;
  quality: number;
};
