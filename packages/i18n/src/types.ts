/**
 * Language configuration type
 */
export type Language<TKey extends string = string> = {
  /** Language key (e.g., "en", "zh", "fr") */
  key: TKey;
  /** Text direction for the language */
  dir?: "ltr" | "rtl";
  /** Font scale multiplier for the language */
  fontScale?: number;
};

/**
 * Extract language keys from a language configuration array
 */
export type LanguageKey<T extends readonly Language[]> = T[number]["key"];
