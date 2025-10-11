import type { Language } from "./types";

export interface DetectLanguageOptions<T extends readonly Language[]> {
  /** Available languages */
  availableLanguages: T;
  /** Default language key */
  defaultLanguage: string;
  /** Optional input language key (highest priority) */
  input?: string;
  /** Cookie value from i18next cookie */
  cookieValue?: string;
  /** Accept-Language header value */
  acceptLanguageHeader?: string;
}

/**
 * Detects user language from multiple sources with priority:
 * 1. Input parameter (explicit override)
 * 2. Cookie value
 * 3. Accept-Language header
 * 4. Default language
 *
 * @param options - Detection options
 * @returns Detected language key
 */
export function detectLanguage<T extends readonly Language[]>({
  availableLanguages,
  defaultLanguage,
  input,
  cookieValue,
  acceptLanguageHeader,
}: DetectLanguageOptions<T>): string {
  // Priority 1: Explicit input
  if (input && availableLanguages.some((l) => l.key === input)) {
    return input;
  }

  // Priority 2: Cookie value
  if (cookieValue && availableLanguages.some((l) => l.key === cookieValue)) {
    return cookieValue;
  }

  // Priority 3: Accept-Language header
  if (acceptLanguageHeader) {
    const headerLang = acceptLanguageHeader
      .split(",")[0] // Get the first language ar,en-US -> ar
      ?.split("-")[0]; // Get the first part en-US -> en

    if (headerLang && availableLanguages.some((l) => l.key === headerLang)) {
      return headerLang;
    }
  }

  // Priority 4: Default language
  return defaultLanguage;
}

/**
 * Parse the accept-language header value and return the languages that are included in the accepted languages.
 * @param languageHeaderValue - Accept-Language header value
 * @param acceptedLanguages - List of accepted language keys
 * @returns Array of matching language keys sorted by quality value
 */
export function parseAcceptLanguageHeader(
  languageHeaderValue: string | null | undefined,
  acceptedLanguages: string[],
): string[] {
  // Return an empty array if the header value is not provided
  if (!languageHeaderValue) return [];

  const ignoreWildcard = true;

  // Split the header value by comma and map each language to its quality value
  return languageHeaderValue
    .split(",")
    .map((lang): [number, string] => {
      const [locale, q = "q=1"] = lang.split(";");

      if (!locale) return [0, ""];

      const trimmedLocale = locale.trim();
      const numQ = Number(q.replace(/q ?=/, ""));

      return [Number.isNaN(numQ) ? 0 : numQ, trimmedLocale];
    })
    .sort(([q1], [q2]) => q2 - q1) // Sort by quality value in descending order
    .flatMap(([_, locale]) => {
      // Ignore wildcard '*' if 'ignoreWildcard' is true
      if (locale === "*" && ignoreWildcard) return [];

      const languageSegment = locale.split("-")[0];

      if (!languageSegment) return [];

      // Return the locale if it's included in the accepted languages
      try {
        return acceptedLanguages.includes(languageSegment) ? [languageSegment] : [];
      } catch {
        return [];
      }
    });
}

/**
 * Validates if a language key exists in available languages
 */
export function isValidLanguage<T extends readonly Language[]>(
  key: string,
  availableLanguages: T,
): boolean {
  return availableLanguages.some((l) => l.key === key);
}

/**
 * Gets language configuration by key
 */
export function getLanguageConfig<T extends readonly Language[]>(
  key: string,
  availableLanguages: T,
): T[number] | undefined {
  return availableLanguages.find((l) => l.key === key);
}
