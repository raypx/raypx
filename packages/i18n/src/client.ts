import type { InitOptions } from "i18next";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

/**
 * Callback function to sync language changes with external libraries
 * @param langKey - The language key that was changed to
 */
export type LanguageSyncCallback = (langKey: string) => void;

/**
 * Initialize i18n for client-side usage
 * @param config - i18next configuration
 * @param syncCallback - Optional callback to sync language changes (e.g., with dayjs)
 * @returns The initialized i18n instance
 */
export function initializeI18n(config: InitOptions, syncCallback?: LanguageSyncCallback) {
  i18n.use(LanguageDetector).use(initReactI18next).init(config);

  if (syncCallback) {
    // Sync on initialization
    if (i18n.language) {
      syncCallback(i18n.language);
    }

    // Sync on language change
    i18n.on("languageChanged", syncCallback);
  }

  return i18n;
}

export default i18n;
