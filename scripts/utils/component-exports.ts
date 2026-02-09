import { createHash } from "node:crypto";
import { join } from "node:path";
import fg from "fast-glob";
import fs from "fs-extra";
import { NODE_MODULES_PATH, PROJECT_ROOT } from "./paths";

/**
 * Get cache file path (computed lazily to avoid module initialization issues)
 */
function getCacheFilePath(): string {
  return join(NODE_MODULES_PATH, ".cache/raypx-scripts/component-exports.json");
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
 * Validates package name to prevent object injection attacks
 */
function isValidPackageName(pkgName: string): boolean {
  // Only allow alphanumeric characters, hyphens, and underscores
  return /^[a-zA-Z0-9_-]+$/.test(pkgName);
}

/**
 * Generates component exports for a specific package directory
 */
export async function generateComponentExports(pkgName: string): Promise<void> {
  const componentsDir = join(PROJECT_ROOT, `packages/ui/src/${pkgName}`);
  const fileName = "index.tsx";
  const filePath = join(componentsDir, fileName);

  const fgConfig = {
    cwd: componentsDir,
    onlyFiles: true,
    ignore: [fileName],
  };
  const entries = (await fg("*.tsx", fgConfig)).sort();

  if (entries.length === 0) return;

  // Validate package name to prevent object injection
  if (!isValidPackageName(pkgName)) {
    throw new Error(`Invalid package name: ${pkgName}`);
  }

  // Check cache to avoid unnecessary regeneration
  const cache = await loadCache();
  const currentHash = computeHash(entries);
  // Use Object.hasOwn for safe property access
  const cached = Object.hasOwn(cache, pkgName) ? cache[pkgName] : undefined;

  // Skip generation if cache exists and file list hasn't changed
  const isCacheValid = cached?.hash === currentHash;
  if (isCacheValid) {
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

  // Update cache (pkgName is already validated above)
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
