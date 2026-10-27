import type { CatalogSources } from "../catalog-store.js";
import en from "../messages/en.js";

/** The default catalog stays in the entry chunk; other languages load on first use. */
export const catalogs: CatalogSources = {
  en,
  zh: () => import("../messages/zh.js").then((module) => module.default),
};
