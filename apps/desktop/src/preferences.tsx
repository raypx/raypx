import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BrowserLanguageProvider,
  getBrowserSystemLocales,
  readBrowserPreference,
  useLanguagePreference,
} from "@raypx/i18n/browser";
import { LOCALE_PREFERENCE_KEY } from "@raypx/i18n/preferences";
import { readStoredTheme, storeTheme, ThemeProvider, useTheme } from "@raypx/ui/themes";
import {
  DEFAULT_DEVICE_PREFERENCES,
  DEVICE_PREFERENCES_KEY,
  isDevicePreferences,
  type DevicePreferences,
  type PreferenceSnapshot,
} from "../preferences";
import { isDesktop, saveDesktopPreferences } from "./lib/desktop";

function restoreDevicePreferences(snapshot: unknown): PreferenceSnapshot {
  if (snapshot && typeof snapshot === "object" && "status" in snapshot) {
    if (snapshot.status === "read" && "raw" in snapshot && isDevicePreferences(snapshot.raw))
      return { status: "valid", preferences: { ...snapshot.raw } };
    if (snapshot.status === "missing") {
      // A first native launch migrates WebView values; unreadable storage falls back.
      const theme = readStoredTheme(DEFAULT_DEVICE_PREFERENCES.theme);
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
    // WebView mirrors are best effort; the native snapshot remains authoritative.
    storeTheme(theme);
    try {
      localStorage.setItem(LOCALE_PREFERENCE_KEY, preference);
    } catch {
      // Ignored for the same reason.
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
// A native snapshot wins; without one the shared script falls back to WebView storage.
export const desktopInitialThemeSource = `(function () {
  var snapshot = window[${JSON.stringify(DEVICE_PREFERENCES_KEY)}];
  if (!snapshot || snapshot.status === "missing") return undefined;
  var raw = snapshot.raw;
  return snapshot.status === "read" && raw && ["light", "dark", "system"].includes(raw.theme) ? raw.theme : "system";
})()`;
