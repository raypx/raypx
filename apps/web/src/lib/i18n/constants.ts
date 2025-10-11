import type { Language, LanguageKey } from "@raypx/i18n";

import type locales from "@/locales";

export const DEFAULT_NAMESPACE = "common";

export const DEFAULT_LANGUAGE_KEY: keyof typeof locales = "en";

export const AVAILABLE_LANGUAGES = [
  {
    key: "en",
  } as const,
  {
    key: "zh",
  } as const,
  {
    key: "fr",
  } as const,
  {
    key: "ar",
    dir: "rtl",
    fontScale: 1.2,
  } as const,
  {
    key: "sw",
  } as const,
] satisfies Language[];

export type AppLanguageKey = LanguageKey<typeof AVAILABLE_LANGUAGES>;
