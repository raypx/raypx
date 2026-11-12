import type { CatalogSources } from "@raypx/i18n/browser";
import en from "./en/index.js";

export const messages: CatalogSources<typeof en> = {
  en,
  zh: () => import("./zh/index.js").then((module) => module.default),
};
