import {
  createBrowserLocaleStorage as createIntlBrowserLocaleStorage,
  createLocalStorageLocaleStorage as createIntlLocalStorageLocaleStorage,
} from "@voidmix/intl/client";
import { LOCALE_STORAGE_KEY } from "../constants.js";
import { normalizeLocale } from "../normalize.js";
import { localeRuntime } from "../runtime.js";
import type { LocaleStorage } from "../types.js";

export function createBrowserLocaleStorage(): LocaleStorage {
  return createIntlBrowserLocaleStorage(localeRuntime);
}

export function createLocalStorageLocaleStorage(): LocaleStorage {
  const storage = createIntlLocalStorageLocaleStorage(localeRuntime, { key: LOCALE_STORAGE_KEY });
  return {
    read() {
      try {
        const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
        if (stored !== null && stored !== undefined) return storage.read();
        // Only Raypx owns migration from its former product key.
        const previous = normalizeLocale(globalThis.localStorage?.getItem("voidmix_locale"));
        if (previous) {
          try {
            storage.write(previous);
          } catch {
            // A blocked migration must still recover the old preference.
          }
        }
        return previous;
      } catch {
        return undefined;
      }
    },
    write: storage.write,
  };
}
