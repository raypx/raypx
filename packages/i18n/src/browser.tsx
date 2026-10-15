import { useEffect, useState, type ReactNode } from "react";
import { LanguageProvider } from "./language-provider";
import { useLocale } from "./react";
import { LOCALE_PREFERENCE_KEY, parseLocalePreference, type LocalePreference } from "./preferences";

function readPreference(): LocalePreference {
  try {
    return parseLocalePreference(localStorage.getItem(LOCALE_PREFERENCE_KEY));
  } catch {
    return "system";
  }
}
function DocumentLanguage() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
export function BrowserLanguageProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readPreference);
  const [systemLocale, setSystemLocale] = useState(() => navigator.language);
  useEffect(() => {
    const language = () => setSystemLocale(navigator.language);
    const storage = (event: StorageEvent) => {
      if (event.key === LOCALE_PREFERENCE_KEY) setPreference(parseLocalePreference(event.newValue));
    };
    window.addEventListener("languagechange", language);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("languagechange", language);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function change(value: LocalePreference) {
    setPreference(value);
    try {
      localStorage.setItem(LOCALE_PREFERENCE_KEY, value);
    } catch {
      /* In-memory preferences remain available. */
    }
  }
  return (
    <LanguageProvider
      preference={preference}
      systemLocale={systemLocale}
      onPreferenceChange={change}
    >
      <DocumentLanguage />
      {children}
    </LanguageProvider>
  );
}
export { useLanguagePreference } from "./language-provider";
export { useTranslations, useLocale, useFormatter } from "./react";
