import type {
  Formats,
  IntlConfig,
  MessageKeys,
  NamespaceKeys,
  NestedKeyOf,
  NestedValueOf,
  createTranslator,
} from "use-intl/core";

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
export type { DateTimeFormatOptions } from "use-intl/core";
export type IntlFormats = Formats;
export type ResolvedIntlFormats = { [K in keyof Formats]-?: NonNullable<Formats[K]> };
export type IntlRuntimeOptions = Pick<
  IntlConfig,
  "timeZone" | "formats" | "now" | "onError" | "getMessageFallback"
>;
export type IntlDefaults = Omit<IntlRuntimeOptions, "now">;

export interface LocaleConfig<L extends string> {
  locales: readonly L[];
  defaultLocale: NoInfer<L>;
  cookieName?: string;
  cookieMaxAgeSeconds?: number;
}
export type LocalePreference<L extends string = string> = L | "system";
export interface LocaleSource<L extends string = string> {
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
  fallbackLocale?: L;
}
export interface AcceptLanguagePreference {
  locale: string;
  quality: number;
}
export interface LocaleRuntime<L extends string = string> {
  readonly locales: readonly L[];
  readonly defaultLocale: L;
  readonly cookieName: string;
  readonly cookieMaxAgeSeconds: number;
  isLocale(value: string): value is L;
  normalizeLocale(value: string | null | undefined): L | undefined;
  matchLocale(candidates: readonly string[]): L | undefined;
  parsePreference(value: unknown): LocalePreference<L>;
  resolvePreference(preference: LocalePreference<L>, locales: readonly string[]): L;
  getLocaleCookie(cookieHeader: string | null | undefined): L | undefined;
  serializeLocaleCookie(locale: L, options?: { secure?: boolean }): string;
  resolveLocale(source?: LocaleSource<L>): L;
}
