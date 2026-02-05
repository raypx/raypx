import { defaultLocale, type Locale, locales } from "@raypx/intl";
import { defineI18n } from "fumadocs-core/i18n";

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

export const i18n = defineI18n({
  defaultLanguage: defaultLocale,
  languages: [...locales],
});

export { defaultLocale };
