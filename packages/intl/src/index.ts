import type { Locale as UseIntlLocale } from "use-intl";

import type baseMessages from "../messages/en.json";

export const defaultLocale: (typeof locales)[number] = "en";
type BaseMessages = typeof baseMessages;
export const locales = ["en", "zh"] as const;
export type Locale = UseIntlLocale;

export function isLocale(locale: unknown): locale is Locale {
  return typeof locale === "string" && (locales as readonly string[]).includes(locale);
}

declare module "use-intl" {
  interface AppConfig {
    Locale: (typeof locales)[number];
    Messages: BaseMessages;
  }
}

async function getMessages(locale: Locale) {
  switch (locale) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "en":
      return (await import("../messages/en.json")) as unknown as BaseMessages;
    case "zh":
      return (await import("../messages/zh.json")) as unknown as BaseMessages;
  }
}

async function getZodLocale(locale: Locale) {
  switch (locale) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "en":
      return (await import("zod/v4/locales/en.js")).default;
  }
}

function getLocale(localeRouteParam: string | undefined): Locale {
  if (isLocale(localeRouteParam)) {
    return localeRouteParam;
  }
  return defaultLocale;
}

export async function getIntlContext(localeRouteParam: string | undefined) {
  const locale = getLocale(localeRouteParam);
  const messages = await getMessages(locale);
  // z.config((await getZodLocale(locale))());
  return {
    locale: locale,
    messages: messages,
  };
}

export const localeHeader = "raypx-intl-Locale";
