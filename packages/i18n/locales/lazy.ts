import type { CatalogSources } from "../src/catalog-store.js";
import en from "./en/index.js";

/** The default catalog stays in the entry chunk; other languages load on first use. */
export const messages: CatalogSources = {
  en,
  zh: () => import("./zh/index.js").then((module) => module.default),
};
