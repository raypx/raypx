import { detectLanguage } from "@raypx/i18n/server";
import { getCookie, getRequestHeaders, setCookie } from "@tanstack/react-start/server";
import { AVAILABLE_LANGUAGES, COOKIE_NAME, DEFAULT_LANGUAGE_KEY } from "@/lib/i18n/constants";
/**
 * Retrieves the user's language preference from server context.
 *
 * @param {string} [input] - Optional input language key. If not provided, the function will attempt to retrieve the language from the configured cookie.
 * @returns {string} - Returns the language key if it is available in the list of supported languages. Otherwise, returns the default language key.
 */
export const getUserLanguage = (input?: string) => {
  const language = detectLanguage({
    availableLanguages: AVAILABLE_LANGUAGES,
    defaultLanguage: DEFAULT_LANGUAGE_KEY,
    input,
    cookieValue: getCookie(COOKIE_NAME),
    acceptLanguageHeader: getRequestHeaders().get("accept-language") ?? undefined,
  });

  // Set cookie for future requests
  setCookie(COOKIE_NAME, language, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
    sameSite: "lax",
  });

  return language;
};
