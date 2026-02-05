import { getRequestConfig } from "next-intl/server";
import enMessages from "../messages/en.json";
import zhMessages from "../messages/zh.json";
import type { Locale } from "./locales";
import { locales } from "./locales";

const messages = {
  en: enMessages,
  zh: zhMessages,
};

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  const validLocale = locale as Locale;
  if (!locales.includes(validLocale)) {
    return {
      locale: locales[0],
      messages: messages[locales[0]],
    };
  }

  return {
    locale: validLocale,
    messages: messages[validLocale],
  };
});
