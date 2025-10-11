import { detectLanguage } from "@raypx/i18n";
import { getCookie, getRequestHeaders, setCookie } from "@tanstack/react-start/server";

import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE_KEY } from "@/lib/i18n/constants";

/**
 * Retrieves the user's language preference from server context.
 *
 * @param {string} [input] - Optional input language key. If not provided, the function will attempt to retrieve the language from a cookie named 'i18next'.
 * @returns {string} - Returns the language key if it is available in the list of supported languages. Otherwise, returns the default language key.
 */
export const getUserLanguage = (input?: string) => {
  const language = detectLanguage({
    availableLanguages: AVAILABLE_LANGUAGES,
    defaultLanguage: DEFAULT_LANGUAGE_KEY,
    input,
    cookieValue: getCookie("i18next"),
    acceptLanguageHeader: getRequestHeaders().get("accept-language") ?? undefined,
  });

  // Set cookie for future requests
  setCookie("i18next", language);

  return language;
};
