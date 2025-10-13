import { createTranslationResolver } from "@raypx/i18n";
import { createI18nConfig } from "@raypx/i18n/config";
import { logger } from "@raypx/shared/logger";
import type { InitOptions } from "i18next";
import {
  AVAILABLE_LANGUAGES,
  COOKIE_NAME,
  DEFAULT_LANGUAGE_KEY,
  DEFAULT_NAMESPACE,
} from "./constants";

type TranslationModule = { default: Record<string, unknown> };

const translationModules = import.meta.glob<TranslationModule>("../../locales/*/*.json");

export const translationResolver = createTranslationResolver(translationModules, {
  onMissing(language, namespace) {
    logger.warn(`[i18n] Missing translation file for ${language}/${namespace}`);
  },
  onLoadError(language, namespace, error) {
    logger.error(`[i18n] Error loading translation: ${language}/${namespace}`, error);
  },
});

export const i18nConfig: InitOptions = createI18nConfig({
  languages: AVAILABLE_LANGUAGES,
  defaultLanguage: DEFAULT_LANGUAGE_KEY as string,
  defaultNamespace: DEFAULT_NAMESPACE,
  cookieName: COOKIE_NAME,
  cookieMinutes: 43200, // 30 days
  enableDetection: true,
});
