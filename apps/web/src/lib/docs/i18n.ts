import { defineI18n } from "fumadocs-core/i18n";
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE_KEY } from "../i18n/constants";

/**
 * Internationalization configuration for FumaDocs
 *
 * https://fumadocs.dev/docs/ui/internationalization
 */
export const docsI18nConfig = defineI18n({
  defaultLanguage: DEFAULT_LANGUAGE_KEY,
  languages: AVAILABLE_LANGUAGES.map((l) => l.key) as unknown as string[],
  hideLocale: "never",
  fallbackLanguage: DEFAULT_LANGUAGE_KEY,
});
