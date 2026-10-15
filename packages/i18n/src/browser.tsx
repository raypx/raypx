import { useEffect, useState, type ReactNode } from "react";
import { LOCALE_COOKIE_NAME } from "./constants";
import { serializeLocaleCookie } from "./cookie";
import { LanguageProvider } from "./language-provider";
import { useLocale } from "./react";
import { LOCALE_PREFERENCE_KEY, parseLocalePreference, type LocalePreference } from "./preferences";

function readStoredPreference(): LocalePreference | undefined {
  try {
    const value = localStorage.getItem(LOCALE_PREFERENCE_KEY);
    return value === null ? undefined : parseLocalePreference(value);
  } catch {
    return undefined;
  }
}
/** The cookie lets server rendering use the same choice; "system" clears it. */
function storeCookie(value: LocalePreference) {
  try {
    document.cookie =
      value === "system"
        ? `${LOCALE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
        : serializeLocaleCookie(value, { secure: location.protocol === "https:" });
  } catch {
    /* Cookies only seed server rendering; device storage remains authoritative. */
  }
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
  /** Server-rendered values own the first render so hydration matches. */
  initialPreference?: LocalePreference;
  initialSystemLocale?: string;
}
export function BrowserLanguageProvider({
  children,
  initialPreference,
  initialSystemLocale,
}: BrowserLanguageProviderProps) {
  const [preference, setPreference] = useState(
    () => initialPreference ?? readStoredPreference() ?? "system",
  );
  const [systemLocale, setSystemLocale] = useState(() => initialSystemLocale ?? navigator.language);
  useEffect(() => {
    // Reconcile server-rendered values with this device after hydration.
    const stored = readStoredPreference();
    if (stored !== undefined) {
      setPreference(stored);
      storeCookie(stored);
    }
    setSystemLocale(navigator.language);
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
    storeCookie(value);
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
