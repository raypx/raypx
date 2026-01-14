import i18n from "i18next";
import { createI18nConfig, defaultLocale, type SupportedLocale } from "./config";
import { resources } from "./resources";

export interface I18nServerOptions {
  lng?: SupportedLocale;
  fallbackLng?: SupportedLocale;
  resources?: typeof resources;
}

/**
 * Initialize i18n for server-side usage
 */
export async function initI18nServer(options?: I18nServerOptions) {
  const config = createI18nConfig({
    lng: options?.lng || defaultLocale,
    fallbackLng: options?.fallbackLng || defaultLocale,
    resources: options?.resources || resources,
  });

  await i18n.init({
    ...config,
    resources: options?.resources || resources,
  });

  return i18n;
}

/**
 * Get translation for a key (server-side)
 */
export function t(
  key: string,
  options?: { lng?: SupportedLocale; [key: string]: unknown },
): string {
  const { lng, ...interpolationOptions } = options || {};
  if (lng) {
    return i18n.getFixedT(lng)(key, interpolationOptions);
  }
  return i18n.t(key, interpolationOptions);
}

/**
 * Check if a language is supported
 */
export function isSupportedLanguage(lng: string): lng is SupportedLocale {
  return ["en", "zh", "zh-CN", "zh-TW"].includes(lng);
}

export { default as i18n } from "i18next";
