import { existsSync } from "node:fs";
import path, { join } from "node:path";
import { compile, paraglideVitePlugin } from "@inlang/paraglide-js";
import fs from "fs-extra";
import { trimEnd } from "lodash-es";
import type { Plugin, PluginOption } from "vite";

export const urls = ["/api/:path(.*)?", "/", "/docs", "/:path(.*)", "/:path(.*)?"];
export const outDir = ".output";

export const locales = ["en", "zh"];
export const baseLocale = "en";

export type Strategy =
  | "cookie"
  | "baseLocale"
  | "globalVariable"
  | "url"
  | "preferredLanguage"
  | "localStorage"
  | `custom-${string}`;

export type RaypxVitePluginOptions = {
  strategy: Strategy[];
  cookieName?: string;
  outputStructure?: "locale-modules" | "message-modules";
};

export const urlPatterns = [
  ...(urls.map((u) => ({
    pattern: u,
    localized: locales.map((l) => [l, u.startsWith("/api") ? u : trimEnd(join("/", l, u), "/")]),
  })) satisfies { pattern: string; localized: [string, string][] }[]),
];

const virtualIds = new Set<string>([
  "@raypx/i18n/runtime",
  "@raypx/i18n/server",
  "@raypx/i18n/messages",
]);

/**
 * Create virtual module content for i18n
 * Maps @raypx/i18n/* imports to the compiled paraglide output
 */
function createVirtualModule(rootDir: string, file: string, exports = "*"): string {
  const exportStatement =
    exports === "*"
      ? `export * from "${rootDir}/${file}";`
      : `export { ${exports} } from "${rootDir}/${file}";`;

  return `import "urlpattern-polyfill";\n${exportStatement}`;
}

/**
 * Vite plugin that provides virtual modules for i18n
 *
 * This plugin creates virtual module aliases for @raypx/i18n/* that map to
 * the compiled paraglide output. The actual compilation is handled by the
 * official paraglideVitePlugin, but this plugin ensures the output exists
 * in development mode as a fallback.
 *
 * Virtual modules:
 * - @raypx/i18n/runtime  -> .output/paraglide/runtime.js
 * - @raypx/i18n/server   -> .output/paraglide/server.js
 * - @raypx/i18n/messages -> .output/paraglide/messages.js
 */
async function vitePlugin(opts: RaypxVitePluginOptions): Promise<PluginOption> {
  const virtualModules: Record<string, string> = {};
  const cacheDir = path.join(process.cwd(), "node_modules", ".raypx");
  const outDir = path.join(cacheDir, "paraglide");
  fs.ensureDirSync(cacheDir);
  const inlangDirName = "inlang";
  const projectPath = path.join(process.cwd(), inlangDirName);

  /**
   * Compile paraglide if output doesn't exist
   * This is a fallback for cases where the output directory was cleaned
   */
  async function ensureParaglideCompiled(): Promise<void> {
    // Check if paraglide output exists
    if (!existsSync(outDir)) {
      try {
        await compile({
          project: projectPath,
          outdir: outDir,
          outputStructure: "message-modules",
          cookieName: "lang",
          strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
          urlPatterns,
        });
      } catch (error) {
        // throw error;
        console.error(error);
      }
    }
  }
  await ensureParaglideCompiled();

  return [
    {
      name: "@raypx/i18n-plugin",
      enforce: "pre",
      async configResolved() {
        virtualModules["\0@raypx/i18n/messages"] = createVirtualModule(outDir, "messages.js");
        virtualModules["\0@raypx/i18n/runtime"] = createVirtualModule(outDir, "runtime.js");
        virtualModules["\0@raypx/i18n/server"] = createVirtualModule(outDir, "server.js");
      },
      resolveId(id) {
        if (virtualIds.has(id)) return `\0${id}`;
        return null;
      },

      load(id) {
        return virtualModules[id] ?? null;
      },
    } satisfies Plugin,
    paraglideVitePlugin({
      project: projectPath,
      outdir: outDir,
      outputStructure: opts.outputStructure,
      cookieName: opts.cookieName,
      strategy: opts.strategy,
      urlPatterns,
      cleanOutdir: false,
    }),
  ];
}

export default vitePlugin;
