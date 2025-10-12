import type { InitOptions } from "i18next";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

/**
 * Translation resolver function type
 * Dynamically loads translation files based on language and namespace
 * @param language - The language code (e.g., 'en', 'zh')
 * @param namespace - The namespace (e.g., 'common', 'home')
 * @returns A promise that resolves to the translation data
 */
export type TranslationResolver = (language: string, namespace: string) => Promise<any>;

/**
 * Callback function to sync language changes with external libraries
 * Can be synchronous or asynchronous
 * @param langKey - The language key that was changed to
 */
export type LanguageSyncCallback = (langKey: string) => void | Promise<void>;

/**
 * Initialize i18n for client-side usage
 * @param config - i18next configuration
 * @param resolver - Optional resolver function for lazy loading translations
 * @param syncCallback - Optional callback to sync language changes (e.g., with dayjs)
 * @returns The initialized i18n instance
 */
export function initializeI18n(
  config: InitOptions,
  resolver?: TranslationResolver,
  syncCallback?: LanguageSyncCallback,
) {
  if (resolver) {
    // Lazy loading mode - use resourcesToBackend with resolver
    i18n
      .use(
        resourcesToBackend(async (language, namespace, callback) => {
          try {
            const data = await resolver(language, namespace);
            callback(null, data);
          } catch (error) {
            console.error(`Error loading translation: ${language}/${namespace}`, error);
            callback(error as Error, null);
          }
        }),
      )
      .use(LanguageDetector)
      .use(initReactI18next)
      .init(config);
  } else {
    // Eager loading mode - traditional initialization
    i18n.use(LanguageDetector).use(initReactI18next).init(config);
  }

  if (syncCallback) {
    // Sync on initialization
    if (i18n.language) {
      const result = syncCallback(i18n.language);
      // Handle async callbacks
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("Error in sync callback during initialization:", error);
        });
      }
    }

    // Sync on language change
    i18n.on("languageChanged", (langKey) => {
      const result = syncCallback(langKey);
      // Handle async callbacks
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error("Error in sync callback:", error);
        });
      }
    });
  }

  return i18n;
}

export default i18n;
