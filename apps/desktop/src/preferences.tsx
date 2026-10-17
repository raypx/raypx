import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BrowserLanguageProvider,
  getBrowserSystemLocales,
  readBrowserPreference,
  useLanguagePreference,
} from "@raypx/i18n/browser";
import { LOCALE_PREFERENCE_KEY } from "@raypx/i18n/preferences";
import { parseTheme, THEME_STORAGE_KEY } from "@raypx/ui/theme";
import { ThemeProvider, useTheme } from "@raypx/ui/theme/client";
import {
  DEFAULT_DEVICE_PREFERENCES,
  DEVICE_PREFERENCES_KEY,
  isDevicePreferences,
  type DevicePreferences,
  type PreferenceSnapshot,
} from "../preferences";
import { isDesktop, saveDesktopPreferences } from "./lib/desktop";

export function restoreDevicePreferences(snapshot: unknown): PreferenceSnapshot {
  if (snapshot && typeof snapshot === "object" && "status" in snapshot) {
    if (
      snapshot.status === "valid" &&
      "preferences" in snapshot &&
      isDevicePreferences(snapshot.preferences)
    )
      return { status: "valid", preferences: { ...snapshot.preferences } };
    if (snapshot.status === "missing") {
      let theme = DEFAULT_DEVICE_PREFERENCES.theme;
      try {
        theme = parseTheme(localStorage.getItem(THEME_STORAGE_KEY), theme);
      } catch {
        // A first native launch can migrate without working WebView storage.
      }
      return { status: "missing", preferences: { theme, locale: readBrowserPreference() } };
    }
  }
  // A failed native read must never resurrect stale WebView values.
  return { status: "error", preferences: { ...DEFAULT_DEVICE_PREFERENCES } };
}

function samePreferences(left: DevicePreferences | null, right: DevicePreferences) {
  return left?.theme === right.theme && left.locale === right.locale;
}

function PersistPreferences({ initial }: { initial: PreferenceSnapshot }) {
  const { theme } = useTheme();
  const { preference, hydrated } = useLanguagePreference();
  const lastRequested = useRef<DevicePreferences | null>(
    initial.status === "missing" ? null : initial.preferences,
  );
  useEffect(() => {
    const next = { theme, locale: preference };
    if (!hydrated) return;
    for (const [key, value] of [
      [THEME_STORAGE_KEY, theme],
      [LOCALE_PREFERENCE_KEY, preference],
    ] as const) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // The native snapshot remains authoritative when WebView persistence fails.
      }
    }
    if (samePreferences(lastRequested.current, next)) return;
    lastRequested.current = next;
    void saveDesktopPreferences(next).catch(() => {});
  }, [theme, preference, hydrated]);
  return null;
}

/** Native snapshots own initial state; browser preview keeps its normal storage adapters. */
export function DesktopPreferencesProvider({ children }: { children: ReactNode }) {
  const [systemLocales] = useState(getBrowserSystemLocales);
  const [initial] = useState(() => {
    if (!isDesktop()) return null;
    return restoreDevicePreferences(Reflect.get(window, DEVICE_PREFERENCES_KEY));
  });
  return (
    <ThemeProvider
      disableScript
      {...(initial ? { initialTheme: initial.preferences.theme, storageKey: false as const } : {})}
    >
      <BrowserLanguageProvider
        initialSystemLocales={systemLocales}
        {...(initial
          ? { initialPreference: initial.preferences.locale, restorePreference: false }
          : {})}
      >
        {initial && <PersistPreferences initial={initial} />}
        {children}
      </BrowserLanguageProvider>
    </ThemeProvider>
  );
}

// The prerendered shell has no text. Apply only appearance before its first paint;
// the controlled language provider resolves the complete system language list.
export const desktopThemeScript = `(function () {
  var theme = "system";
  var snapshot = window[${JSON.stringify(DEVICE_PREFERENCES_KEY)}];
  if (snapshot && snapshot.status !== "missing") {
    if (snapshot.status === "valid") theme = snapshot.preferences.theme;
  } else {
    try { theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || theme; } catch (e) {}
  }
  if (theme !== "light" && theme !== "dark")
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();`;
