import { createScopedI18n, initializeI18n } from "@raypx/i18n";
import type { i18n as I18nInstance } from "i18next";
import { i18nConfig, translationResolver } from "@/lib/i18n/config";
import { DEFAULT_NAMESPACE } from "@/lib/i18n/constants";

/**
 * Dynamically load and sync dayjs locale with i18n language
 * @param langKey - The language key to load (e.g., 'en', 'zh')
 */
export const syncLanguage = async (langKey: string) => {
  try {
    // English is the default locale, no need to import
    await import(`../../locales/${langKey}/index.js`);
  } catch (error) {
    console.warn(`[dayjs] Failed to load locale for ${langKey}:`, error);
    // Fallback to English
  }
};

// Initialize i18n with lazy loading resolver and dayjs sync
export const i18n = initializeI18n(i18nConfig, translationResolver, syncLanguage);
export const changeLanguage = i18n.changeLanguage;

export default i18n;

/**
 * Create an isolated i18n instance for server-side rendering.
 * Detects the preferred language ahead of time and preloads the required namespaces.
 */
export async function createServerI18n(
  language: string,
  namespaces: string[] = [DEFAULT_NAMESPACE],
): Promise<I18nInstance> {
  return createScopedI18n({
    config: i18nConfig,
    language,
    namespaces,
    resolver: translationResolver,
    syncCallback: syncLanguage,
    enableBrowserLanguageDetection: false,
  });
}
