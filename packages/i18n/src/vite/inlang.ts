import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import type { I18nConfig } from "..";

/**
 * Generate inlang project configuration
 */
export function getInlangConfig(config: I18nConfig, pathPatterns: string) {
  return {
    $schema: "https://inlang.com/schema/project-settings",
    baseLocale: config.baseLocale,
    locales: config.locales,
    modules: ["https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@latest/dist/index.js"],
    "plugin.inlang.i18next": {
      pathPattern: pathPatterns,
    },
  };
}

/**
 * Setup inlang project directory and configuration files
 */
export function setupInlangProject(params: {
  cacheDir: string;
  inlangConfig: Record<string, any>;
  projectId?: string;
}): { inlangDir: string; projectPath: string } {
  const { cacheDir, inlangConfig, projectId } = params;
  const cacheDirPath = path.join(process.cwd(), cacheDir);
  const inlangDir = path.join(cacheDirPath, "inlang");

  // Ensure directories exist
  fs.ensureDirSync(cacheDirPath);
  fs.ensureDirSync(inlangDir);

  // Write inlang configuration
  fs.writeJsonSync(path.join(inlangDir, "settings.json"), inlangConfig, { spaces: 2 });

  // Write or reuse project ID
  fs.writeFileSync(path.join(inlangDir, "project_id"), projectId || crypto.randomUUID());

  const projectPath = path.isAbsolute(inlangDir) ? inlangDir : path.join(process.cwd(), inlangDir);

  return { inlangDir, projectPath };
}
