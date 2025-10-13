import { createI18nConfig } from "@raypx/i18n/config";
import { logger } from "@raypx/shared/logger";
import type { InitOptions } from "i18next";
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE_KEY, DEFAULT_NAMESPACE } from "./constants";

export const i18nConfig: InitOptions = createI18nConfig({
  languages: AVAILABLE_LANGUAGES,
  defaultLanguage: DEFAULT_LANGUAGE_KEY as string,
  defaultNamespace: DEFAULT_NAMESPACE,
  cookieName: "lang",
  cookieMinutes: 43200, // 30 days
  enableDetection: true,
});

/**
 * Translation resolver for lazy loading
 * Dynamically imports translation files based on language and namespace
 */
export async function translationResolver(language: string, namespace: string) {
  try {
    const data = await import(`../../locales/${language}/${namespace}.json`);
    return data.default || data;
  } catch (error) {
    logger.error(`[i18n] Error loading translation: ${language}/${namespace}`, error);
    return {};
  }
}
