import type { I18nConfig } from "@raypx/i18n";

/**
 * Centralized i18n configuration for the application
 *
 * This file is the single source of truth for all i18n settings.
 * The vite plugin will automatically read this configuration and:
 * - Generate inlang/settings.json
 * - Build URL patterns for routing
 * - Compile paraglide messages
 */
const i18n = {
  // Basic paraglide settings
  baseLocale: "en",
  locales: ["en", "zh"],
  pathPattern: "./messages/{locale}.json",

  // URL routing patterns
  // These will be transformed into localized routes like /en/*, /zh/*
  urls: ["/", "/docs", "/:path(.*)", "/:path(.*)?"],

  // Optional: Vite plugin defaults (can be overridden in vite.config.ts)
  outputStructure: "message-modules",
  cookieName: "lang",
  strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
} satisfies I18nConfig;

export default i18n;
