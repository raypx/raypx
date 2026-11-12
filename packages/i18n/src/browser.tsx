import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createCatalogLanguageProvider } from "./catalog-provider.js";
import { createCatalogStore, type CatalogSources } from "./catalog-store.js";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from "./constants.js";
import { getLocaleCookie, normalizeLocale, serializeLocaleCookie } from "./locale.js";
import {
  LOCALE_PREFERENCE_KEY,
  parseLocalePreference,
  type LocalePreference,
} from "./preferences.js";
import { createTranslations, IntlProvider, useLocale, useMessages } from "./react.js";
import type { DynamicMessages, Locale } from "./types.js";

export type { CatalogSources };

export interface BrowserLanguageProviderProps<L extends string = string> {
  children?: ReactNode;
  /** The first render uses only this snapshot, including during SSR hydration. */
  initialPreference?: L | "system";
  initialSystemLocales?: readonly string[];
  /** Native bootstrap owns restoration; this also disables cross-window storage sync. */
  restorePreference?: boolean;
}

/** Device languages in priority order, falling back to the single primary language. */
export function getBrowserSystemLocales(): readonly string[] {
  return navigator.languages.length > 0 ? [...navigator.languages] : [navigator.language];
}

function writePreference(preference: LocalePreference): void {
  try {
    localStorage.setItem(LOCALE_PREFERENCE_KEY, preference);
  } catch {
    // In-memory preferences remain usable when storage is unavailable.
  }
}

function restoreBrowserPreference(fallback: LocalePreference): LocalePreference {
  try {
    const stored = localStorage.getItem(LOCALE_PREFERENCE_KEY);
    if (stored !== null) return parseLocalePreference(stored);
    const preference = getLocaleCookie(document.cookie) ?? "system";
    writePreference(preference);
    return preference;
  } catch {
    return fallback;
  }
}

function storeCookie(preference: LocalePreference): void {
  try {
    document.cookie =
      preference === "system"
        ? `${LOCALE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
        : serializeLocaleCookie(preference, { secure: location.protocol === "https:" });
  } catch {
    // In-memory preferences remain usable when cookies are unavailable.
  }
}

function DocumentLanguage() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

/** Bind one application's catalogs once at module scope, outside React renders. */
export function createBrowserI18n<M extends DynamicMessages>(sources: CatalogSources<M>) {
  const store = createCatalogStore(sources);
  const CatalogLanguageProvider = createCatalogLanguageProvider(store);

  function BrowserLanguageProvider({
    children,
    initialPreference = "system",
    initialSystemLocales = [],
    restorePreference = true,
  }: BrowserLanguageProviderProps<Locale>) {
    const initial = useRef(initialPreference);
    const [preference, setPreference] = useState(initialPreference);
    const [systemLocales, setSystemLocales] = useState(initialSystemLocales);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
      if (restorePreference) {
        const restored = restoreBrowserPreference(initial.current);
        setPreference(restored);
        storeCookie(restored);
      }
      setSystemLocales(getBrowserSystemLocales());
      setHydrated(true);

      const onLanguageChange = () => setSystemLocales(getBrowserSystemLocales());
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== LOCALE_PREFERENCE_KEY) return;
        try {
          if (event.storageArea !== localStorage) return;
        } catch {
          return;
        }
        const next = parseLocalePreference(event.newValue);
        if (next === "system" && event.newValue !== "system") writePreference("system");
        setPreference(next);
        storeCookie(next);
      };
      window.addEventListener("languagechange", onLanguageChange);
      if (restorePreference) window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("languagechange", onLanguageChange);
        if (restorePreference) window.removeEventListener("storage", onStorage);
      };
    }, [restorePreference]);

    const change = useCallback((value: LocalePreference) => {
      const next = parseLocalePreference(value);
      setPreference(next);
      writePreference(next);
      storeCookie(next);
    }, []);

    return (
      <CatalogLanguageProvider
        preference={preference}
        systemLocales={systemLocales}
        onPreferenceChange={change}
        hydrated={hydrated}
      >
        <DocumentLanguage />
        <DeviceTimeZone>{children}</DeviceTimeZone>
      </CatalogLanguageProvider>
    );
  }

  return {
    BrowserLanguageProvider,
    useTranslations: createTranslations<M>(),
    /** Match the server language before hydration; subsequent loads share this cache. */
    preloadCatalog: (locale: string | null | undefined) =>
      store.load(normalizeLocale(locale) ?? DEFAULT_LOCALE),
  };
}

const noSubscription = () => () => {};
const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const serverTimeZone = () => "UTC";

/** UTC for SSR/hydration, then device time without remounting the provider. */
function DeviceTimeZone({ children }: { children?: ReactNode }) {
  const locale = useLocale();
  const catalog = useMessages();
  const timeZone = useSyncExternalStore(noSubscription, deviceTimeZone, serverTimeZone);
  return (
    <IntlProvider locale={locale} messages={catalog} timeZone={timeZone}>
      {children}
    </IntlProvider>
  );
}

export {
  createTranslations,
  useLanguagePreference,
  useLocale,
  useFormatter,
  useNow,
  useTimeZone,
} from "./react.js";
