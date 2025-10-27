import { join } from "node:path";
import { trimEnd } from "lodash-es";

export const urls = ["/api/:path(.*)?", "/docs", "/:path(.*)?"];
export const outDir = ".output";

export const locales = ["en", "zh"];
export const baseLocale = "en";

export const urlPatterns = urls.map((u) => ({
  pattern: u,
  localized: locales.map((l) => [l, u.startsWith("/api") ? u : trimEnd(join("/", l, u), "/")]),
})) satisfies { pattern: string; localized: [string, string][] }[];
