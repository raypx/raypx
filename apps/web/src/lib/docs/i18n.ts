import { baseLocale, locales } from "@raypx/i18n/runtime";
import { defineI18n } from "fumadocs-core/i18n";

/**
 * Internationalization configuration for FumaDocs
 *
 * https://fumadocs.dev/docs/ui/internationalization
 */
export const docsI18nConfig = defineI18n({
  defaultLanguage: baseLocale as string,
  languages: locales as unknown as string[],
});
