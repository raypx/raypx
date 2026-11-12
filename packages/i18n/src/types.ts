import type {
  IntlConfig,
  MessageKeys,
  NamespaceKeys,
  NestedKeyOf,
  NestedValueOf,
  createTranslator,
} from "use-intl/core";
import type { LOCALE_OPTIONS, SUPPORTED_LOCALES } from "./constants.js";

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleOption = (typeof LOCALE_OPTIONS)[number];
export type MessageTree = { readonly [key: string]: string | MessageTree };
export type MessageCatalog = MessageTree;
/** The upstream unconstrained catalog type keeps dynamic callers deliberately broad. */
export type DynamicMessages = NonNullable<Parameters<typeof createTranslator>[0]["messages"]>;
export type CatalogShape<M extends DynamicMessages> = string extends keyof M
  ? MessageCatalog
  : { readonly [K in keyof M]: M[K] extends string ? string : CatalogShape<M[K]> };
export type NamespaceOf<M extends DynamicMessages> = string extends keyof M
  ? string
  : NamespaceKeys<M, NestedKeyOf<M>>;
export type MessageKey<
  M extends DynamicMessages,
  N extends NamespaceOf<M> = never,
> = string extends keyof M
  ? string
  : [N] extends [never]
    ? MessageKeys<M, NestedKeyOf<M>>
    : MessageKeys<NestedValueOf<M, N>, NestedKeyOf<NestedValueOf<M, N>>>;

export type TranslationValue = string | number | bigint | boolean | Date | null;
export type TranslationValues = Record<string, TranslationValue>;
export type IntlRuntimeOptions = Pick<
  IntlConfig,
  "timeZone" | "formats" | "now" | "onError" | "getMessageFallback"
>;

export type Messages<M extends DynamicMessages = DynamicMessages> = CatalogShape<M>;
export type MessagesByLocale<M extends DynamicMessages = DynamicMessages> = Readonly<
  Record<Locale, Messages<M>>
>;
export interface LocaleSource {
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
  fallbackLocale?: Locale;
}
export interface AcceptLanguagePreference {
  locale: string;
  quality: number;
}
