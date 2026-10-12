import { getLocaleCookie, serializeLocaleCookie } from "../cookie.js";
import { LOCALE_STORAGE_KEY } from "../constants.js";
import { normalizeLocale } from "../normalize.js";
import type { LocaleStorage } from "../types.js";

export function createBrowserLocaleStorage(): LocaleStorage {
  return {
    read() {
      if (typeof document === "undefined") return undefined;
      try {
        return getLocaleCookie(document.cookie);
      } catch {
        return undefined;
      }
    },
    write(locale) {
      if (typeof document === "undefined") return;
      try {
        const secure = globalThis.location?.protocol === "https:";
        document.cookie = serializeLocaleCookie(locale, { secure });
      } catch {
        // Cookie access can be denied by browser privacy settings or a sandbox.
      }
    },
  };
}

export function createLocalStorageLocaleStorage(): LocaleStorage {
  return {
    read() {
      try {
        const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
        if (stored !== null && stored !== undefined) return normalizeLocale(stored);
        // Migrate only an absent key, preserving an explicit Raypx preference.
        const previous = normalizeLocale(globalThis.localStorage?.getItem("voidmix_locale"));
        if (previous) {
          try {
            globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, previous);
          } catch {
            // Keep the old preference usable when storage is read-only.
          }
        }
        return previous;
      } catch {
        return undefined;
      }
    },
    write(locale) {
      try {
        globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {
        // Storage can be unavailable in private or restricted WebViews.
      }
    },
  };
}
