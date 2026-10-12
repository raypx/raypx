const DEFAULT_LOCALE = "en" as const;
const LOCALE_COOKIE_NAME = "locale" as const;
const LOCALE_STORAGE_KEY = "voidmix_locale" as const;
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const SUPPORTED_LOCALES = ["en", "zh"] as const;
const LOCALE_OPTIONS = [
  { value: "en", nativeName: "English" },
  { value: "zh", nativeName: "简体中文" },
] as const satisfies ReadonlyArray<{
  value: (typeof SUPPORTED_LOCALES)[number];
  nativeName: string;
}>;

export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
};
