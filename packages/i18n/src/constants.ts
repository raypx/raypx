import config from "./config.js";

const DEFAULT_LOCALE = config.defaultLocale;
const LOCALE_COOKIE_NAME = "locale" as const;
const LOCALE_STORAGE_KEY = "raypx_locale" as const;
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
type ConfiguredLocaleOption = {
  [Locale in keyof typeof config.locales]: {
    readonly value: Locale;
    readonly nativeName: (typeof config.locales)[Locale];
  };
}[keyof typeof config.locales];
const LOCALE_OPTIONS = Object.freeze(
  Object.entries(config.locales).map(
    ([value, nativeName]) => ({ value, nativeName }) as ConfiguredLocaleOption,
  ),
);
const SUPPORTED_LOCALES = Object.freeze(LOCALE_OPTIONS.map((option) => option.value));

export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
};
