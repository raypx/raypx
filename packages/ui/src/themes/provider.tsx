"use client";

import { createContext, use, useEffect, useMemo, useSyncExternalStore } from "react";

import {
  THEME_STORAGE_KEY,
  parseTheme,
  readThemeCookie,
  themeColors,
  type AppTheme,
  type UserTheme,
} from "./config";
import { createThemeScript, type ThemeScriptOptions } from "./script";

interface ThemeContextValue {
  theme: UserTheme;
  resolvedTheme: AppTheme;
  setTheme: (theme: UserTheme) => void;
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Server- or native-known preference; also the fallback for invalid stored values. */
  initialTheme?: UserTheme;
  /** Persistence key; `false` keeps the choice in memory only. */
  storageKey?: string | false;
}

/** Reads the persisted preference from localStorage, then the cookie mirror. */
export function readStoredTheme(
  fallback: UserTheme = "system",
  storageKey: string = THEME_STORAGE_KEY,
): UserTheme {
  if (typeof window === "undefined") return fallback;
  const cookieTheme = () => {
    try {
      return readThemeCookie(document.cookie, storageKey);
    } catch {
      return null;
    }
  };
  try {
    return parseTheme(window.localStorage.getItem(storageKey), cookieTheme() ?? fallback);
  } catch {
    return cookieTheme() ?? fallback;
  }
}

function getSystemTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: UserTheme): AppTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function getHydrationResolvedTheme(theme: UserTheme): AppTheme {
  return theme === "system" ? "light" : theme;
}

/** Persists the preference to localStorage and the cookie read by server rendering. */
export function storeTheme(theme: UserTheme, storageKey: string = THEME_STORAGE_KEY): void {
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Theme switching still works when storage is unavailable.
  }
  try {
    document.cookie = `${storageKey}=${encodeURIComponent(theme)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Cookie persistence is best effort and must not block theme changes.
  }
}

function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  // Created outside React's head when no script ran, so hydration never claims it.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = themeColors[theme];
}

function setupMediaListener(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange();
  mediaQuery.addEventListener("change", handler);
  return () => mediaQuery.removeEventListener("change", handler);
}

function createThemeStore(initialTheme: UserTheme, storageKey: string | false) {
  // The server and hydration share this snapshot before React reads device preferences.
  const serverSnapshot = {
    theme: initialTheme,
    resolvedTheme: getHydrationResolvedTheme(initialTheme),
  };
  let snapshot = serverSnapshot;
  // Retain explicit choices even when persistence is disabled or unavailable.
  let selectedTheme: UserTheme | undefined;
  const listeners = new Set<() => void>();

  function getSnapshot() {
    const theme =
      selectedTheme ??
      (storageKey === false ? initialTheme : readStoredTheme(initialTheme, storageKey));
    const resolvedTheme = resolveTheme(theme);
    if (snapshot.theme !== theme || snapshot.resolvedTheme !== resolvedTheme) {
      snapshot = { theme, resolvedTheme };
    }
    return snapshot;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot,
    getServerSnapshot: () => serverSnapshot,
    setTheme: (nextTheme: UserTheme) => {
      selectedTheme = nextTheme;
      if (storageKey !== false) storeTheme(nextTheme, storageKey);
      notify();
    },
    subscribe: (onChange: () => void) => {
      listeners.add(onChange);
      const removeMediaListener = setupMediaListener(onChange);
      const handleStorage = (event: StorageEvent) => {
        if (storageKey === false || event.key !== storageKey) return;
        selectedTheme = parseTheme(event.newValue, initialTheme);
        notify();
      };
      if (storageKey !== false) window.addEventListener("storage", handleStorage);
      return () => {
        listeners.delete(onChange);
        removeMediaListener();
        if (storageKey !== false) window.removeEventListener("storage", handleStorage);
      };
    },
  };
}

export function ThemeScript({
  storageKey = THEME_STORAGE_KEY,
  initialThemeSource,
}: ThemeScriptOptions) {
  if (storageKey === false && !initialThemeSource) return null;
  const html = createThemeScript({
    storageKey,
    ...(initialThemeSource ? { initialThemeSource } : {}),
  });
  // oxlint-disable-next-line react/no-danger -- Generated first-paint theme script interpolates only application-owned values.
  return <script dangerouslySetInnerHTML={{ __html: html }} />;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** Applies and persists the theme; render `ThemeScript` in the document head for first paint. */
export function ThemeProvider({
  children,
  initialTheme = "system",
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps) {
  const store = useMemo(
    () => createThemeStore(initialTheme, storageKey),
    [initialTheme, storageKey],
  );
  const { theme, resolvedTheme } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  useEffect(() => applyTheme(resolvedTheme), [resolvedTheme]);

  const contextValue = useMemo(
    () => ({ theme, resolvedTheme, setTheme: store.setTheme }),
    [resolvedTheme, store, theme],
  );

  return <ThemeContext value={contextValue}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
