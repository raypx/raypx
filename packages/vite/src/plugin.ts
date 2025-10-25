import path from "path";
import type { Plugin } from "vite";
import { compile } from "@inlang/paraglide-js";

import { join } from "node:path";
import { trimEnd } from "lodash-es";

export const urls = ["/", "/:path(.*)?"];
export const outDir = ".output";

export const locales = ["en", "zh"];
export const baseLocale = "en";

export const urlPatterns = urls.map((u) => ({
  pattern: u,
  localized: locales.map((l) => [l, trimEnd(join("/", l, u), "/")]),
})) satisfies { pattern: string; localized: [string, string][] }[];


export async function compileParaglide() {
  const result = await compile({
    project: "./.inlang",
    outdir: "./.output/paraglide",
    outputStructure: "message-modules",
    cookieName: "lang",
    strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
    urlPatterns,
  });
  return result;
}


const i18nRuntimeId = "@raypx/i18n/runtime";
const i18nServerId = "@raypx/i18n/server";
const i18nMessagesId = "@raypx/i18n/messages";

const virtualIds = new Set<string>([i18nRuntimeId, i18nServerId, i18nMessagesId]);

function vitePlugin(): Plugin {
  let virtualModules: Record<string, string> = {};
  const cwd = path.join(process.cwd(), ".output");
  return {
    name: "@raypx/vite-plugin",
    enforce: "pre",
    config: (config, env) => {
      console.log("env", env);
      virtualModules = {
        [`\0${i18nMessagesId}`]: `import "urlpattern-polyfill";
export * from "${cwd}/paraglide/messages.js";`,
        [`\0${i18nRuntimeId}`]: `import "urlpattern-polyfill";
export * from "${cwd}/paraglide/runtime.js";`,
        [`\0${i18nServerId}`]: `import "urlpattern-polyfill";
export { paraglideMiddleware } from "${cwd}/paraglide/server.js";`,
      };
    },
    configureServer: async () => {
      await compileParaglide();
      console.log("configureServer");
    },
    resolveId: async (id) => {
      if (virtualIds.has(id)) return `\0${id}`;
      return null;
    },
    load: async (id) => {
      if (virtualModules[id]) {
        return virtualModules[id];
      }
      return null;
    },
  } satisfies Plugin;
}

export default vitePlugin;
