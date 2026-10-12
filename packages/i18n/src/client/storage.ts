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
        return normalizeLocale(globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY));
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
