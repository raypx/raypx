import { existsSync } from "node:fs";
import path, { join } from "node:path";
import { compile } from "@inlang/paraglide-js";
import { trimEnd } from "lodash-es";
import type { Plugin, ResolvedConfig } from "vite";

export const urls = ["/api/:path(.*)?", "/docs", "/:path(.*)?"];
export const outDir = ".output";

export const locales = ["en", "zh"];
export const baseLocale = "en";

export const urlPatterns = urls.map((u) => ({
  pattern: u,
  localized: locales.map((l) => [l, u.startsWith("/api") ? u : trimEnd(join("/", l, u), "/")]),
})) satisfies { pattern: string; localized: [string, string][] }[];

/**
 * Compile paraglide if output doesn't exist
 * This is a fallback for cases where the output directory was cleaned
 */
async function ensureParaglideCompiled(config: ResolvedConfig): Promise<void> {
  const paraglideOutDir = path.join(config.root, outDir, "paraglide");

  // Check if paraglide output exists
  if (!existsSync(paraglideOutDir)) {
    config.logger.warn("Paraglide output not found, compiling...", { timestamp: true });

    try {
      const projectPath = path.join(config.root, ".inlang");

      await compile({
        project: projectPath,
        outdir: paraglideOutDir,
        outputStructure: "message-modules",
        cookieName: "lang",
        strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
        urlPatterns,
      });

      config.logger.info("Paraglide compiled successfully", { timestamp: true });
    } catch (error) {
      config.logger.error("Failed to compile paraglide:", { error: error as Error });
      throw error;
    }
  }
}

const i18nRuntimeId = "@raypx/i18n/runtime";
const i18nServerId = "@raypx/i18n/server";
const i18nMessagesId = "@raypx/i18n/messages";

const virtualIds = new Set<string>([i18nRuntimeId, i18nServerId, i18nMessagesId]);

/**
 * Create virtual module content for i18n
 * Maps @raypx/i18n/* imports to the compiled paraglide output
 */
function createVirtualModule(rootDir: string, file: string, exports = "*"): string {
  const exportStatement =
    exports === "*"
      ? `export * from "${rootDir}/paraglide/${file}";`
      : `export { ${exports} } from "${rootDir}/paraglide/${file}";`;

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
function vitePlugin(): Plugin {
  let virtualModules: Record<string, string> = {};
  let config: ResolvedConfig;
  const cacheDir = path.join(process.cwd(), ".raypx");
  console.log("cacheDir", cacheDir);

  return {
    name: "@raypx/vite-plugin",
    enforce: "pre",
    async configResolved(resolvedConfig) {
      config = resolvedConfig;
      const rootDir = path.join(config.root, outDir);
      await ensureParaglideCompiled(config);

      // Initialize virtual modules with resolved root path
      virtualModules = {
        [`\0${i18nMessagesId}`]: createVirtualModule(rootDir, "messages.js"),
        [`\0${i18nRuntimeId}`]: createVirtualModule(rootDir, "runtime.js"),
        [`\0${i18nServerId}`]: createVirtualModule(rootDir, "server.js", "paraglideMiddleware"),
      };
    },
    resolveId(id) {
      if (virtualIds.has(id)) return `\0${id}`;
      return null;
    },

    load(id) {
      return virtualModules[id] ?? null;
    },
  } satisfies Plugin;
}

export default vitePlugin;
