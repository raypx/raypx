import { defineI18n } from "fumadocs-core/i18n";
import { baseLocale, locales } from "@/lib/i18n/runtime";

/**
 * Internationalization configuration for FumaDocs
 *
 * https://fumadocs.dev/docs/ui/internationalization
 */
export const docsI18nConfig = defineI18n({
  defaultLanguage: baseLocale as string,
  languages: locales as unknown as string[],
});
