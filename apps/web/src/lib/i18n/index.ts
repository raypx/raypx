import { initializeI18n } from "@raypx/i18n";
import { i18nConfig, translationResolver } from "@/lib/i18n/config";

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

export default i18n;
