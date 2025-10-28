import { existsSync } from "node:fs";
import path from "node:path";
import { compile, paraglideVitePlugin } from "@inlang/paraglide-js";
import fs from "fs-extra";
import type { Plugin, PluginOption } from "vite";
import { urlPatterns } from ".";
import { get } from 'lodash-es'
import fg from "fast-glob";
import CryptoJS from "crypto-js";

export type Strategy =
  | "cookie"
  | "baseLocale"
  | "globalVariable"
  | "url"
  | "preferredLanguage"
  | "localStorage"
  | `custom-${string}`;

export const I18N_DEFAULTS = {
  outputStructure: "message-modules" as const,
  cookieName: "lang",
  strategy: ["url", "cookie", "preferredLanguage", "baseLocale"] as Strategy[],
  inlangDir: "inlang",
  cacheDir: "node_modules/.raypx",
};

export type RaypxVitePluginOptions = {
  strategy?: Strategy[];
  cookieName?: string;
  outputStructure?: "locale-modules" | "message-modules";
  inlangDir?: string;
  cacheDir?: string;
};

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
 * - @raypx/i18n/runtime  -> node_modules/.raypx/paraglide/runtime.js
 * - @raypx/i18n/server   -> node_modules/.raypx/paraglide/server.js
 * - @raypx/i18n/messages -> node_modules/.raypx/paraglide/messages.js
 */
async function vitePlugin(opts: RaypxVitePluginOptions = {}): Promise<PluginOption> {
  const virtualModules: Record<string, string> = {};
  const {
    outputStructure = I18N_DEFAULTS.outputStructure,
    cookieName = I18N_DEFAULTS.cookieName,
    strategy = I18N_DEFAULTS.strategy,
    inlangDir = I18N_DEFAULTS.inlangDir,
    cacheDir = I18N_DEFAULTS.cacheDir,
  } = opts;
  const cacheDirPath = path.join(process.cwd(), cacheDir);
  const outDir = path.join(cacheDirPath, "paraglide");
  fs.ensureDirSync(cacheDirPath);
  const projectPath = path.join(process.cwd(), inlangDir);
  const projectConfig = fs.readJsonSync(path.join(projectPath, "settings.json"));
  const messagesFiles = fg.sync(path.join(projectPath, get(get(projectConfig, "plugin.inlang.messageFormat"), "pathPattern")), { onlyFiles: true }).sort();
  const contents =  messagesFiles.map(file => fs.readFileSync(file, "utf-8")).join("\n");
  const messagesFilesHash = CryptoJS.MD5(contents).toString(); // 输出MD5值
  console.log("messagesFilesHash", messagesFilesHash);

  const cacheHashFile = path.join(outDir, "cache.hash");
  const getCacheHash = () => {
    if (!existsSync(cacheHashFile)) {
      return null;
    }
    return fs.readFileSync(cacheHashFile, "utf-8");
  }

  /**
   * Compile paraglide if output doesn't exist
   * This is a fallback for cases where the output directory was cleaned
   */
  async function ensureParaglideCompiled(): Promise<void> {
    // Check if paraglide output exists
    if (!existsSync(outDir) || messagesFilesHash !== getCacheHash()) {
      await compile({
        project: projectPath,
        outdir: outDir,
        outputStructure,
        cookieName,
        strategy,
        urlPatterns,
      });
      fs.writeFileSync(cacheHashFile, messagesFilesHash);
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
      outputStructure,
      cookieName,
      strategy,
      urlPatterns,
      cleanOutdir: false,
    }),
  ];
}

export default vitePlugin;
