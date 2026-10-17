import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LanguageProvider } from "./language-provider.js";
import { useLocale } from "./react.js";
import {
  LOCALE_PREFERENCE_KEY,
  parseLocalePreference,
  type LocalePreference,
} from "./preferences.js";
import {
  restoreBrowserPreference,
  storePreferenceCookie,
  writeBrowserPreference,
} from "./browser/storage.js";

export function getBrowserSystemLocales(): readonly string[] {
  return navigator.languages.length > 0 ? [...navigator.languages] : [navigator.language];
}

function DocumentLanguage() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

export interface BrowserLanguageProviderProps {
  children: ReactNode;
  /** The first render uses only this snapshot, including during SSR hydration. */
  initialPreference?: LocalePreference;
  initialSystemLocales?: readonly string[];
  /** Native bootstrap owns restoration and disables browser storage events. */
  restorePreference?: boolean;
}

export function BrowserLanguageProvider({
  children,
  initialPreference = "system",
  initialSystemLocales = [],
  restorePreference = true,
}: BrowserLanguageProviderProps) {
  const initial = useRef(initialPreference);
  const [preference, setPreference] = useState(initialPreference);
  const [systemLocales, setSystemLocales] = useState(initialSystemLocales);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (restorePreference) {
      const restored = restoreBrowserPreference(initial.current);
      setPreference(restored);
      storePreferenceCookie(restored);
    }
    setSystemLocales(getBrowserSystemLocales());
    setHydrated(true);
    const language = () => setSystemLocales(getBrowserSystemLocales());
    const storage = (event: StorageEvent) => {
      if (!restorePreference || (event.key !== null && event.key !== LOCALE_PREFERENCE_KEY)) return;
      try {
        if (event.storageArea !== localStorage) return;
      } catch {
        return;
      }
      // Deletion/clear resets the current selection, without resurrecting a legacy key.
      const next = parseLocalePreference(event.newValue);
      if (next === "system" && event.newValue !== "system") {
        // A reset marker also prevents a surviving legacy key from winning after remount.
        writeBrowserPreference("system");
      }
      setPreference(next);
      storePreferenceCookie(next);
    };
    window.addEventListener("languagechange", language);
    if (restorePreference) window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("languagechange", language);
      if (restorePreference) window.removeEventListener("storage", storage);
    };
  }, [restorePreference]);
  const change = useCallback((value: LocalePreference) => {
    const next = parseLocalePreference(value);
    setPreference(next);
    writeBrowserPreference(next);
    storePreferenceCookie(next);
  }, []);
  return (
    <LanguageProvider
      preference={preference}
      systemLocales={systemLocales}
      onPreferenceChange={change}
      hydrated={hydrated}
    >
      <DocumentLanguage />
      {children}
    </LanguageProvider>
  );
}
export { useLanguagePreference } from "./language-provider.js";
export {
  useTranslations,
  useLocale,
  useFormatter,
  useNow,
  useTimeZone,
  useMessages,
} from "./react.js";
export { LanguageSelect } from "./browser/language-select.js";
export { readBrowserPreference } from "./browser/storage.js";
