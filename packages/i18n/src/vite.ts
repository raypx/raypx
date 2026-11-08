import { fileURLToPath } from "node:url";
import type { Plugin } from "vite-plus";

export interface I18nCatalogOptions {
  /**
   * `static` bundles every catalog. `lazy` keeps the default catalog in the client
   * entry and splits the others into chunks. Server environments always stay static.
   */
  catalogs?: "static" | "lazy";
}

const source = fileURLToPath(new URL(".", import.meta.url));
const lazyCatalogs = fileURLToPath(new URL("./catalogs/lazy.ts", import.meta.url));

/** Selects how `@raypx/i18n/browser` ships catalogs to the browser. */
export function i18nCatalogs({ catalogs = "static" }: I18nCatalogOptions = {}): Plugin {
  return {
    name: "raypx:i18n-catalogs",
    enforce: "pre",
    resolveId(id, importer) {
      if (catalogs !== "lazy" || id !== "#catalogs" || !importer?.startsWith(source)) return;
      if (this.environment.config.consumer !== "client") return;
      return lazyCatalogs;
    },
  };
}
