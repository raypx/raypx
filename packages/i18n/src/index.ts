import { join } from "node:path";
import { trimEnd } from "lodash-es";
import type { Strategy } from "./types";

/**
 * Build URL patterns for i18n routing
 */
export function buildUrlPatterns(urls: string[], locales: string[]) {
  return urls.map((u) => ({
    pattern: u,
    localized: locales.map((l) => [l, u.startsWith("/api") ? u : trimEnd(join("/", l, u), "/")]),
  })) satisfies { pattern: string; localized: [string, string][] }[];
}

/**
 * Complete i18n configuration
 */
export type I18nConfig = {
  // Basic paraglide settings
  pathPattern: string;
  baseLocale: string;
  locales: string[];
  projectId?: string;

  // URL routing configuration
  urls?: string[];

  // Vite plugin options (optional, can be overridden in vite.config.ts)
  outputStructure?: "locale-modules" | "message-modules";
  cookieName?: string;
  strategy?: Strategy[];
  cacheDir?: string;
};
