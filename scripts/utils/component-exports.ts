import { createHash } from "node:crypto";
import { join } from "node:path";
import fg from "fast-glob";
import fs from "fs-extra";
import { PROJECT_ROOT } from "./paths";

/**
 * Get cache file path (computed lazily to avoid module initialization issues)
 */
function getCacheFilePath(): string {
  return join(PROJECT_ROOT, "node_modules/.cache/raypx-scripts/component-exports.json");
}

/**
 * Cache structure: maps package name to hash of files list
 */
interface ExportsCache {
  [pkgName: string]: {
    hash: string;
    timestamp: number;
  };
}

/**
 * Load cache from disk
 */
async function loadCache(): Promise<ExportsCache> {
  try {
    const content = await fs.readFile(getCacheFilePath(), "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save cache to disk
 */
async function saveCache(cache: ExportsCache): Promise<void> {
  await fs.outputFile(getCacheFilePath(), JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Compute hash of file list (used for cache invalidation)
 */
function computeHash(files: string[]): string {
  const sorted = [...files].sort();
  return createHash("sha256").update(sorted.join("|")).digest("hex");
}

/**
 * Generates component exports for a specific package directory
 */
export async function generateComponentExports(pkgName: string): Promise<void> {
  const componentsDir = join(PROJECT_ROOT, `packages/ui/src/${pkgName}`);
  const fileName = "index.tsx";
  const filePath = join(componentsDir, fileName);

  const entries = await fg("*.tsx", {
    cwd: componentsDir,
    onlyFiles: true,
    ignore: [fileName],
  });

  if (entries.length === 0) return;

  // Check cache to avoid unnecessary regeneration
  const cache = await loadCache();
  const currentHash = computeHash(entries);
  const cached = cache[pkgName];

  // If hash matches, skip generation
  if (cached && cached.hash === currentHash) {
    return;
  }

  // Generate exports
  const exportsBlock = entries
    .map((entry) => entry.replace(/\.tsx$/, ""))
    .sort()
    .map((name) => `export * from "./${name}";`)
    .join("\n");

  const content = `${exportsBlock}\n`;
  await fs.outputFile(filePath, content, "utf-8");

  // Update cache
  cache[pkgName] = {
    hash: currentHash,
    timestamp: Date.now(),
  };
  await saveCache(cache);
}

/**
 * Generates component exports for all UI packages
 */
export async function generateAllComponentExports(): Promise<void> {
  const packages = ["components", "business"];
  await Promise.all(packages.map(generateComponentExports));
}
