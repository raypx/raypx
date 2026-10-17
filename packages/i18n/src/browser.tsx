import { createBrowserLanguage } from "@voidmix/intl/browser";
import { LOCALE_PREFERENCE_KEY } from "./preferences.js";
import { messages } from "./messages/index.js";
import { intlClient } from "./react.js";
import { localeRuntime } from "./runtime.js";

const browser = createBrowserLanguage(intlClient, localeRuntime, {
  messages,
  storageKey: LOCALE_PREFERENCE_KEY,
  // Values written before the product rename keep working once.
  legacyStorageKeys: ["voidmix_locale"],
});

export const { BrowserLanguageProvider, getBrowserSystemLocales } = browser;
export type { BrowserLanguageProviderProps } from "@voidmix/intl/browser";
/** Restore device storage only; native composition must not inherit browser cookies. */
export const readBrowserPreference = browser.preferences.read;
export { useLanguagePreference } from "./react.js";
export {
  useTranslations,
  useLocale,
  useFormatter,
  useNow,
  useTimeZone,
  useMessages,
} from "./react.js";
export { LanguageSelect } from "./browser/language-select.js";
