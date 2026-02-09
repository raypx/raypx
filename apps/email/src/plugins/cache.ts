/**
 * Template module cache for email templates
 * Handles scanning, caching, and code generation for virtual module
 */

import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

type DirentWithPaths = Dirent & { path?: string; parentPath?: string };

/**
 * Normalize path to template name
 * Example: "auth/reset-password.tsx" -> "auth/reset-password"
 */
export const normalizeTemplateName = (filePath: string): string =>
  filePath.replace(/\.tsx$/, "").replace(/\\/g, "/");

/**
 * Generate virtual module code from template files
 * Creates import statements and exports object for all templates
 */
export function buildModuleCode(templateFiles: string[], templatesPath: string): string {
  const imports = templateFiles.map((file, i) => {
    const fullPath = join(templatesPath, file).replace(/\\/g, "/");
    return `import * as _t${i} from "/@fs/${fullPath}";`;
  });

  const exports = templateFiles.map((file, i) => `  "${normalizeTemplateName(file)}": _t${i}`);

  return `${imports.join("\n")}

export const emailModules = {
${exports.join(",\n")}
};

export default emailModules;
`;
}

/**
 * Template files cache and module generator
 * Scans email templates directory and caches the generated virtual module code
 */
export class ModuleCache {
  private templateFiles: string[] = [];
  private moduleCode = "";
  private isInitialized = false;

  /**
   * Scan templates directory and cache results
   */
  async scan(templatesPath: string): Promise<void> {
    const files = (await readdir(templatesPath, {
      recursive: true,
      withFileTypes: true,
    })) as DirentWithPaths[];

    this.templateFiles = files
      .filter((f) => f.isFile() && f.name.endsWith(".tsx"))
      .map((f) => {
        const parentPath = f.parentPath ?? (f.path ? dirname(f.path) : templatesPath);
        const relativeDir = relative(templatesPath, parentPath);
        return join(relativeDir, f.name).replace(/\\/g, "/");
      })
      .sort(); // Sort for consistent output

    this.moduleCode = buildModuleCode(this.templateFiles, templatesPath);
    this.isInitialized = true;
  }

  /**
   * Get cached module code (scans if not initialized)
   */
  async getModuleCode(templatesPath: string): Promise<string> {
    if (!this.isInitialized) {
      await this.scan(templatesPath);
    }
    return this.moduleCode;
  }

  /**
   * Invalidate cache and rescan
   */
  async invalidate(templatesPath: string): Promise<void> {
    await this.scan(templatesPath);
  }

  /**
   * Check if cache is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current template files list
   */
  get files(): readonly string[] {
    return this.templateFiles;
  }
}
