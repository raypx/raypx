import type { Strategy } from "../types";

/**
 * i18n specific cache configuration
 */
export type I18nCacheConfig = {
  outputStructure: "locale-modules" | "message-modules";
  cookieName: string;
  strategy: Strategy[];
  inlangDir: string;
};

/**
 * Vite plugin options - can override values from config file
 */
export type RaypxVitePluginOptions = {
  // Override strategy from config file
  strategy?: Strategy[];
  cookieName?: string;
  outputStructure?: "locale-modules" | "message-modules";

  // Path to i18n config file
  configPath?: string;

  // Cache directory for compiled output
  cacheDir?: string;
};
