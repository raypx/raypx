import type { InitOptions } from "i18next";
import type { Language } from "./types";

export interface CreateI18nConfigOptions<T extends readonly Language[]> {
  /** Available languages configuration */
  languages: T;
  /** Default language key */
  defaultLanguage: string;
  /** Default namespace */
  defaultNamespace?: string;
  /** i18next resources object */
  resources: InitOptions["resources"];
  /** Cookie name for language detection */
  cookieName?: string;
  /** Cookie expiration in minutes */
  cookieMinutes?: number;
  /** Enable browser language detection */
  enableDetection?: boolean;
}

/**
 * Creates i18next configuration
 * @param options - Configuration options
 * @returns i18next InitOptions
 */
export function createI18nConfig<T extends readonly Language[]>({
  languages,
  defaultLanguage,
  defaultNamespace = "common",
  resources,
  cookieName = "i18next",
  cookieMinutes = 43200, // 30 days
  enableDetection = true,
}: CreateI18nConfigOptions<T>): InitOptions {
  const languageKeys = languages.map((l) => l.key);

  // Extract namespaces from resources
  const namespaces = resources ? Object.keys(resources[defaultLanguage] || {}) : [defaultNamespace];

  return {
    defaultNS: defaultNamespace,
    ns: namespaces,
    resources,
    fallbackLng: defaultLanguage,
    supportedLngs: languageKeys,
    detection: enableDetection
      ? {
          caches: ["cookie"],
          cookieMinutes,
          cookieOptions: { path: "/", sameSite: "lax" },
          lookupCookie: cookieName,
        }
      : undefined,

    // Fix issue with i18next types
    // https://www.i18next.com/overview/typescript#argument-of-type-defaulttfuncreturn-is-not-assignable-to-parameter-of-type-xyz
    returnNull: false,

    interpolation: {
      escapeValue: false, // react already safes from xss
    },

    react: {
      useSuspense: true,
    },
  };
}
