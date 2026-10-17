import { LOCALE_COOKIE_NAME } from "../constants.js";
import { getLocaleCookie, serializeLocaleCookie } from "../cookie.js";
import { normalizeLocale } from "../normalize.js";
import {
  LOCALE_PREFERENCE_KEY,
  parseLocalePreference,
  type LocalePreference,
} from "../preferences.js";

const legacyKey = "voidmix_locale";
type StoredPreference =
  | { status: "found"; preference: LocalePreference }
  | { status: "missing" | "unavailable" };

function readStoredPreference(): StoredPreference {
  try {
    const value = localStorage.getItem(LOCALE_PREFERENCE_KEY);
    if (value !== null) return { status: "found", preference: parseLocalePreference(value) };
    const previous = normalizeLocale(localStorage.getItem(legacyKey));
    if (!previous) return { status: "missing" };
    // Keep the old value when writing the replacement is blocked.
    if (writeBrowserPreference(previous)) {
      try {
        localStorage.removeItem(legacyKey);
      } catch {
        // The new key already owns future restores.
      }
    }
    return { status: "found", preference: previous };
  } catch {
    return { status: "unavailable" };
  }
}

/** Restore device storage only; native composition must not inherit browser cookies. */
export function readBrowserPreference(fallback: LocalePreference = "system"): LocalePreference {
  const stored = readStoredPreference();
  return stored.status === "found" ? stored.preference : fallback;
}

export function writeBrowserPreference(preference: LocalePreference): boolean {
  try {
    localStorage.setItem(LOCALE_PREFERENCE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/** Restore after hydration; unavailable storage preserves the server/native snapshot. */
export function restoreBrowserPreference(fallback: LocalePreference): LocalePreference {
  const stored = readStoredPreference();
  if (stored.status === "found") return stored.preference;
  if (stored.status === "unavailable") return fallback;
  try {
    const preference = getLocaleCookie(document.cookie) ?? "system";
    // Preserve cookie-only users in the current device storage.
    writeBrowserPreference(preference);
    return preference;
  } catch {
    return fallback;
  }
}

/** The server-visible cookie mirrors explicit choices; system follows request languages. */
export function storePreferenceCookie(preference: LocalePreference): void {
  try {
    document.cookie =
      preference === "system"
        ? `${LOCALE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
        : serializeLocaleCookie(preference, { secure: location.protocol === "https:" });
  } catch {
    // In-memory preferences remain usable when cookies are unavailable.
  }
}
