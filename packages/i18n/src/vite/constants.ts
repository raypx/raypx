import type { Strategy } from "../types";

export const I18N_DEFAULTS = {
  outputStructure: "message-modules" as const,
  cookieName: "lang",
  strategy: ["url", "cookie", "preferredLanguage", "baseLocale"] as Strategy[],
  configPath: "src/lib/i18n.ts",
  cacheDir: ".tanstack",
  urls: ["/", "/docs", "/:path(.*)", "/:path(.*)?"] as string[],
};

export const virtualIds = new Set<string>([
  "@raypx/i18n/runtime",
  "@raypx/i18n/server",
  "@raypx/i18n/messages",
]);
