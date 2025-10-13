import type { Language, LanguageKey } from "@raypx/i18n";

export const DEFAULT_NAMESPACE = "common";

export const COOKIE_NAME = "i18next";

export const AVAILABLE_LANGUAGES = [
  {
    key: "en",
    dir: "ltr",
  } as const,
  {
    key: "zh",
    dir: "ltr",
  } as const,
] satisfies readonly Language[];

export const DEFAULT_LANGUAGE_KEY = AVAILABLE_LANGUAGES[0].key;

export type AppLanguageKey = LanguageKey<typeof AVAILABLE_LANGUAGES>;
