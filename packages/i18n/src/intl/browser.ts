import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import type { LanguageProviderProps } from "./client.js";
import type { CatalogShape, DynamicMessages, LocalePreference, LocaleRuntime } from "./types.js";

/** Device languages in priority order, falling back to the single primary language. */
export function getBrowserSystemLocales(): readonly string[] {
  return navigator.languages.length > 0 ? [...navigator.languages] : [navigator.language];
}

export interface BrowserPreferenceOptions {
  /** localStorage key that owns the stored preference. */
  storageKey: string;
  /** Older keys read once, migrated to `storageKey` and removed after the write succeeds. */
  legacyStorageKeys?: readonly string[];
}

type StoredPreference<L extends string> =
  | { status: "found"; preference: LocalePreference<L> }
  | { status: "missing" | "unavailable" };

/**
 * localStorage and cookie adapters for one locale runtime. Every access tolerates
 * blocked storage; the cookie mirrors explicit choices so servers render them.
 */
function createBrowserPreferences<L extends string>(
  runtime: LocaleRuntime<L>,
  { storageKey, legacyStorageKeys = [] }: BrowserPreferenceOptions,
) {
  function write(preference: LocalePreference<L>): boolean {
    try {
      localStorage.setItem(storageKey, preference);
      return true;
    } catch {
      return false;
    }
  }
  function readStored(): StoredPreference<L> {
    try {
      const value = localStorage.getItem(storageKey);
      if (value !== null) return { status: "found", preference: runtime.parsePreference(value) };
      for (const key of legacyStorageKeys) {
        const previous = runtime.normalizeLocale(localStorage.getItem(key));
        if (!previous) continue;
        // Keep the old value when writing the replacement is blocked.
        if (write(previous)) {
          try {
            localStorage.removeItem(key);
          } catch {
            // The new key already owns future restores.
          }
        }
        return { status: "found", preference: previous };
      }
      return { status: "missing" };
    } catch {
      return { status: "unavailable" };
    }
  }
  /** Device storage only; native composition must not inherit browser cookies. */
  function read(fallback: LocalePreference<L> = "system"): LocalePreference<L> {
    const stored = readStored();
    return stored.status === "found" ? stored.preference : fallback;
  }
  /** Restore after hydration; unavailable storage preserves the server or native snapshot. */
  function restore(fallback: LocalePreference<L>): LocalePreference<L> {
    const stored = readStored();
    if (stored.status === "found") return stored.preference;
    if (stored.status === "unavailable") return fallback;
    try {
      const preference = runtime.getLocaleCookie(document.cookie) ?? "system";
      // Preserve cookie-only users in the current device storage.
      write(preference);
      return preference;
    } catch {
      return fallback;
    }
  }
  /** The server-visible cookie mirrors explicit choices; system follows request languages. */
  function storeCookie(preference: LocalePreference<L>): void {
    try {
      document.cookie =
        preference === "system"
          ? `${runtime.cookieName}=; Path=/; Max-Age=0; SameSite=Lax`
          : runtime.serializeLocaleCookie(preference, { secure: location.protocol === "https:" });
    } catch {
      // In-memory preferences remain usable when cookies are unavailable.
    }
  }
  return { storageKey, read, restore, write, storeCookie };
}

export interface BrowserLanguageProviderProps<L extends string = string> {
  children?: ReactNode;
  /** The first render uses only this snapshot, including during SSR hydration. */
  initialPreference?: LocalePreference<L>;
  initialSystemLocales?: readonly string[];
  /** Native bootstrap owns restoration; this also disables cross-window storage sync. */
  restorePreference?: boolean;
}

export interface BrowserLanguageOptions<
  L extends string,
  M extends DynamicMessages,
> extends BrowserPreferenceOptions {
  messages: Readonly<Record<L, CatalogShape<M>>>;
}

/**
 * Binds a bound client's LanguageProvider to browser storage, cookies, language
 * changes and `<html lang>`. Server and first client renders use only the snapshot.
 */
export function createBrowserLanguage<L extends string, M extends DynamicMessages>(
  client: {
    LanguageProvider: ComponentType<LanguageProviderProps<L, M>>;
    useLocale: () => L;
  },
  runtime: LocaleRuntime<L>,
  { messages, ...storage }: BrowserLanguageOptions<L, M>,
) {
  const preferences = createBrowserPreferences(runtime, storage);
  function DocumentLanguage() {
    const locale = client.useLocale();
    useEffect(() => {
      document.documentElement.lang = locale;
    }, [locale]);
    return null;
  }
  function BrowserLanguageProvider({
    children,
    initialPreference = "system",
    initialSystemLocales = [],
    restorePreference = true,
  }: BrowserLanguageProviderProps<L>) {
    const initial = useRef(initialPreference);
    const [preference, setPreference] = useState(initialPreference);
    const [systemLocales, setSystemLocales] = useState(initialSystemLocales);
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
      if (restorePreference) {
        const restored = preferences.restore(initial.current);
        setPreference(restored);
        preferences.storeCookie(restored);
      }
      setSystemLocales(getBrowserSystemLocales());
      setHydrated(true);
      const language = () => setSystemLocales(getBrowserSystemLocales());
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== preferences.storageKey) return;
        try {
          if (event.storageArea !== localStorage) return;
        } catch {
          return;
        }
        // Deletion or clear resets the selection without resurrecting a legacy key.
        const next = runtime.parsePreference(event.newValue);
        // A reset marker also prevents a surviving legacy key from winning after remount.
        if (next === "system" && event.newValue !== "system") preferences.write("system");
        setPreference(next);
        preferences.storeCookie(next);
      };
      window.addEventListener("languagechange", language);
      if (restorePreference) window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("languagechange", language);
        if (restorePreference) window.removeEventListener("storage", onStorage);
      };
    }, [restorePreference]);
    const change = useCallback((value: LocalePreference<L>) => {
      const next = runtime.parsePreference(value);
      setPreference(next);
      preferences.write(next);
      preferences.storeCookie(next);
    }, []);
    return createElement(
      client.LanguageProvider,
      {
        preference,
        systemLocales,
        messages,
        onPreferenceChange: change,
        hydrated,
      } as LanguageProviderProps<L, M>,
      createElement(DocumentLanguage),
      children,
    );
  }
  return { BrowserLanguageProvider, preferences, getBrowserSystemLocales };
}
