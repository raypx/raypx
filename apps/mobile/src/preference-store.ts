import {
  LOCALE_PREFERENCE_KEY,
  parseLocalePreference,
  type LocalePreference,
} from "@raypx/i18n/preferences";
import { parseTheme, THEME_STORAGE_KEY, type UserTheme } from "@raypx/ui/theme";

interface PreferenceStorage {
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  setItem(key: string, value: string): Promise<unknown>;
}

export function createPreferenceStore(storage: PreferenceStorage) {
  let pending: Promise<void> = Promise.resolve();
  function write(key: string, value: string) {
    const request = pending
      .catch(() => {})
      .then(async () => {
        await storage.setItem(key, value);
      });
    pending = request;
    return request;
  }
  return {
    async read() {
      try {
        const values = new Map(await storage.multiGet([THEME_STORAGE_KEY, LOCALE_PREFERENCE_KEY]));
        return {
          theme: parseTheme(values.get(THEME_STORAGE_KEY), "system"),
          locale: parseLocalePreference(values.get(LOCALE_PREFERENCE_KEY)),
        };
      } catch {
        return { theme: "system" as const, locale: "system" as const };
      }
    },
    writeLocale: (locale: LocalePreference) => write(LOCALE_PREFERENCE_KEY, locale),
    writeTheme: (theme: UserTheme) => write(THEME_STORAGE_KEY, theme),
  };
}
