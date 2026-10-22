import { isAnalyticsConsent, parseAnalyticsConsent, type AnalyticsConsent } from "@raypx/analytics";
import { parseLocalePreference, type LocalePreference } from "@raypx/i18n/preferences";
import { parseTheme, type UserTheme } from "@raypx/ui/theme";

export interface DevicePreferences {
  theme: UserTheme;
  locale: LocalePreference;
  analytics?: AnalyticsConsent;
}

export interface PreferenceSnapshot {
  status: "valid" | "missing" | "error";
  preferences: DevicePreferences;
}

export const DEVICE_PREFERENCES_KEY = "__raypxDevicePreferences";
export const DEFAULT_DEVICE_PREFERENCES: Readonly<DevicePreferences> = Object.freeze({
  theme: "system",
  locale: "system",
});

export function parsePreferences(value: unknown): DevicePreferences {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    theme: parseTheme(typeof input.theme === "string" ? input.theme : undefined, "system"),
    locale: parseLocalePreference(input.locale),
    ...(input.analytics !== undefined ? { analytics: parseAnalyticsConsent(input.analytics) } : {}),
  };
}

export function isDevicePreferences(value: unknown): value is DevicePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const parsed = parsePreferences(input);
  return (
    input.theme === parsed.theme &&
    input.locale === parsed.locale &&
    (input.analytics === undefined || isAnalyticsConsent(input.analytics))
  );
}
