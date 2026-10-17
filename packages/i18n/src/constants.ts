const DEFAULT_LOCALE = "en" as const;
const LOCALE_COOKIE_NAME = "locale" as const;
const LOCALE_STORAGE_KEY = "raypx_locale" as const;
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const LOCALE_OPTIONS = [
  { value: "en", nativeName: "English" },
  { value: "zh", nativeName: "简体中文" },
] as const;
const SUPPORTED_LOCALES = Object.freeze(LOCALE_OPTIONS.map((option) => option.value));

export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
};
