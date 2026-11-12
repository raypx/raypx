import { fileURLToPath } from "node:url";
import type { Plugin } from "vite-plus";

export interface I18nCatalogOptions {
  staticEntry: URL;
  lazyEntry: URL;
}

/** Replace only this application's catalog alias, and only in client environments. */
export function i18nCatalogs({ staticEntry, lazyEntry }: I18nCatalogOptions): Plugin {
  const bundled = fileURLToPath(staticEntry);
  const lazy = fileURLToPath(lazyEntry);
  return {
    name: "raypx:i18n-catalogs",
    enforce: "pre",
    async resolveId(id, importer) {
      if (id !== "#messages" || this.environment.config.consumer !== "client") return;
      const resolved = await this.resolve(id, importer, { skipSelf: true });
      if (resolved?.id === bundled) return lazy;
    },
  };
}
