import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { createI18nConfig, defaultLocale, type SupportedLocale } from "./config";
import { resources } from "./resources";

export interface I18nClientOptions {
  lng?: SupportedLocale;
  fallbackLng?: SupportedLocale;
  resources?: typeof resources;
}

/**
 * Initialize i18n for client-side usage
 */
export function initI18n(options?: I18nClientOptions) {
  const config = createI18nConfig({
    lng: options?.lng || defaultLocale,
    fallbackLng: options?.fallbackLng || defaultLocale,
    resources: options?.resources || resources,
  });

  i18n.use(initReactI18next).init(config);

  return i18n;
}

/**
 * Change the current language
 */
export function changeLanguage(lng: SupportedLocale) {
  return i18n.changeLanguage(lng);
}

/**
 * Get the current language
 */
export function getCurrentLanguage(): SupportedLocale {
  return (i18n.language as SupportedLocale) || defaultLocale;
}

/**
 * Check if a language is supported
 */
export function isSupportedLanguage(lng: string): lng is SupportedLocale {
  return ["en", "zh", "zh-CN", "zh-TW"].includes(lng);
}

export { default as i18n } from "i18next";
// Re-export commonly used hooks and utilities from react-i18next
export { Trans, useTranslation, useTranslation as useT } from "react-i18next";
