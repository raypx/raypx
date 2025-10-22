import type { Language, LanguageKey } from "@raypx/i18n";

// ==================== Internationalization Configuration ====================

/** Default namespace */
export const DEFAULT_NAMESPACE = "common";

/** i18n cookie name */
export const COOKIE_NAME = "i18next";

/** Available languages list */
export const AVAILABLE_LANGUAGES = [
  {
    key: "en",
    dir: "ltr",
  } as const,
  {
    key: "zh",
    dir: "ltr",
  } as const,
] as const satisfies readonly Language[];

/** Default language key */
export const DEFAULT_LANGUAGE_KEY = AVAILABLE_LANGUAGES[0].key;

// ==================== Type Exports ====================

/** Available language key type */
export type AvailableLanguageKey = (typeof AVAILABLE_LANGUAGES)[number]["key"];

export type AppLanguageKey = LanguageKey<typeof AVAILABLE_LANGUAGES>;
