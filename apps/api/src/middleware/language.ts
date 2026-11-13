import { languageDetector } from "hono/language";
import { DEFAULT_LOCALE, normalizeLocale, SUPPORTED_LOCALES } from "@raypx/i18n";

export const detectLanguage = languageDetector({
  supportedLanguages: [...SUPPORTED_LOCALES],
  fallbackLanguage: DEFAULT_LOCALE,
  order: ["header"],
  caches: false,
  convertDetectedLanguage: (language) => normalizeLocale(language) ?? "",
});
