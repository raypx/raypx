import type { Language, LanguageKey } from "@raypx/i18n";

export const DEFAULT_NAMESPACE = "common";

export const DEFAULT_LANGUAGE_KEY = "en";

export const AVAILABLE_LANGUAGES = [
  {
    key: "en",
  } as const,
  {
    key: "zh",
  } as const,
] satisfies Language[];

export type AppLanguageKey = LanguageKey<typeof AVAILABLE_LANGUAGES>;
