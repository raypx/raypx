import type { CatalogSources } from "../catalog-store.ts";
import en from "../messages/en.ts";

/** The default catalog stays in the entry chunk; other languages load on first use. */
export const catalogs: CatalogSources = {
  en,
  zh: () => import("../messages/zh.ts").then((module) => module.default),
};
