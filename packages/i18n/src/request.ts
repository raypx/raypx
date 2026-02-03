import { getRequestConfig } from "next-intl/server";
import type { Locale } from "./locales";
import { locales } from "./locales";

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  const validLocale = locale as Locale;
  if (!locales.includes(validLocale)) {
    return {
      locale: locales[0],
      messages: (await import(`@raypx/i18n/messages/${locales[0]}.json`)).default,
    };
  }

  return {
    locale: validLocale,
    messages: (await import(`@raypx/i18n/messages/${validLocale}.json`)).default,
  };
});
