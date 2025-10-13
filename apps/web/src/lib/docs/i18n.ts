import { defineI18n } from "fumadocs-core/i18n";
import { AVAILABLE_LANGUAGES } from "../i18n/constants";

/**
 * Internationalization configuration for FumaDocs
 *
 * https://fumadocs.dev/docs/ui/internationalization
 */
export const docsI18nConfig = defineI18n({
  defaultLanguage: AVAILABLE_LANGUAGES[0].key,
  languages: AVAILABLE_LANGUAGES.map((l) => l.key) as unknown as string[],
});
