import type { InitOptions } from "i18next";

export type SupportedLocale = "en" | "zh" | "zh-CN" | "zh-TW";

export const defaultLocale: SupportedLocale = "en";

export const supportedLocales: SupportedLocale[] = ["en", "zh", "zh-CN", "zh-TW"];

export interface I18nConfig extends InitOptions {
  lng?: SupportedLocale;
  fallbackLng?: SupportedLocale | SupportedLocale[];
  supportedLngs?: SupportedLocale[];
}

export const defaultI18nConfig: I18nConfig = {
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: supportedLocales,
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false,
  },
};

export function createI18nConfig(overrides?: Partial<I18nConfig>): I18nConfig {
  return {
    ...defaultI18nConfig,
    ...overrides,
  };
}
