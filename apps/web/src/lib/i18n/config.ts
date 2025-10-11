import { createI18nConfig } from "@raypx/i18n";
import type { InitOptions } from "i18next";

import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE_KEY, DEFAULT_NAMESPACE } from "@/lib/i18n/constants";
import locales from "@/locales";

export const i18nConfig: InitOptions = createI18nConfig({
  languages: AVAILABLE_LANGUAGES,
  defaultLanguage: DEFAULT_LANGUAGE_KEY,
  defaultNamespace: DEFAULT_NAMESPACE,
  resources: locales,
  cookieName: "i18next",
  cookieMinutes: 43200, // 30 days
  enableDetection: true,
});
