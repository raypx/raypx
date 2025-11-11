import path from "node:path";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { createJiti } from "jiti";
import type { PluginOption } from "vite";
import { buildUrlPatterns, type I18nConfig } from "..";
import { calculateMessagesHash, ensureParaglideCompiled } from "./compiler";
import { I18N_DEFAULTS } from "./constants";
import { getInlangConfig, setupInlangProject } from "./inlang";
import type { RaypxVitePluginOptions } from "./types";
import { createVirtualModulePlugin } from "./virtual-module";

const jiti = createJiti(import.meta.url);

/**
 * Vite plugin that provides virtual modules for i18n
 *
 * This plugin creates virtual module aliases for @raypx/i18n/* that map to
 * the compiled paraglide output. The actual compilation is handled by the
 * official paraglideVitePlugin, but this plugin ensures the output exists
 * in development mode as a fallback.
 *
 * Virtual modules:
 * - @raypx/i18n/runtime  -> .tanstack/paraglide/runtime.js
 * - @raypx/i18n/server   -> .tanstack/paraglide/server.js
 * - @raypx/i18n/messages -> .tanstack/paraglide/messages.js
 */
async function vitePlugin(opts: RaypxVitePluginOptions = {}): Promise<PluginOption> {
  const { configPath = I18N_DEFAULTS.configPath, cacheDir = I18N_DEFAULTS.cacheDir } = opts;

  // Load i18n config from file
  const config: I18nConfig = await jiti.import(path.join(process.cwd(), configPath), {
    default: true,
  });

  // Merge config file values with defaults and plugin options
  // Plugin options > config file > defaults
  const outputStructure =
    opts.outputStructure ?? config.outputStructure ?? I18N_DEFAULTS.outputStructure;
  const cookieName = opts.cookieName ?? config.cookieName ?? I18N_DEFAULTS.cookieName;
  const strategy = opts.strategy ?? config.strategy ?? I18N_DEFAULTS.strategy;
  const urls = config.urls ?? I18N_DEFAULTS.urls;

  // Build URL patterns from config
  const urlPatterns = buildUrlPatterns(urls, config.locales);

  // Generate inlang configuration
  const baseMessagesPathPattern = path.join(process.cwd(), config.pathPattern);
  const inlangConfig = getInlangConfig(config, baseMessagesPathPattern);

  // Calculate message files hash for cache invalidation
  const { hash: messagesFilesHash, files: messagesFiles } = calculateMessagesHash({
    cwd: process.cwd(),
    pattern: config.pathPattern,
  });

  // Setup inlang project directory
  const { inlangDir, projectPath } = setupInlangProject({
    cacheDir,
    inlangConfig,
    projectId: config.projectId,
  });

  // Compile paraglide if needed
  const outDir = path.join(process.cwd(), cacheDir, "paraglide");
  await ensureParaglideCompiled({
    messagesFilesHash,
    outputStructure,
    cookieName,
    strategy,
    inlangDir,
    outDir,
    projectPath,
    urlPatterns,
    messagesFiles,
  });

  return [
    createVirtualModulePlugin(outDir),
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
export * from "./constants";
export * from "./types";
