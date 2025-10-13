import type { i18n as I18nInstance } from "i18next";
import type { Promisable, Simplify } from "type-fest";

/**
 * Language configuration type
 */
export type Language<TKey extends string = string> = Simplify<{
  /** Language key (e.g., "en", "zh", "fr") */
  key: TKey;
  /** Text direction for the language */
  dir?: "ltr" | "rtl";
  /** Font scale multiplier for the language */
  fontScale?: number;
}>;

/**
 * Extract language keys from a language configuration array
 */
export type LanguageKey<T extends readonly Language[]> = T[number]["key"];

export type I18nRequestContext = {
  getRequestI18n: () => I18nInstance | undefined;
  setRequestI18n: (instance: I18nInstance) => void;
  runWithRequestI18n: <T>(instance: I18nInstance, callback: () => Promisable<T>) => Promise<T>;
};
