import { existsSync } from "node:fs";
import path from "node:path";
import fs from "fs-extra";
import { isEqual } from "lodash-es";

/**
 * Cache metadata for tracking file changes and configuration
 */
export type CacheMetadata<TConfig extends Record<string, unknown>> = {
  /** File content hash based on mtime + size */
  hash: string;
  /** Configuration snapshot */
  config: TConfig;
  /** List of message files (for debugging) */
  files: string[];
  /** Cache creation timestamp */
  timestamp: number;
};

/**
 * File change information
 */
export type FileChange = {
  oldHash: string;
  newHash: string;
};

/**
 * Configuration change information
 */
export type ConfigChange<TConfig> = {
  old: TConfig;
  new: TConfig;
};

/**
 * Cache diff result showing what changed
 */
export type CacheDiff<TConfig extends Record<string, unknown>> = {
  /** Whether any changes were detected */
  hasChanges: boolean;
  /** File change details (null if no change) */
  files: FileChange | null;
  /** Config change details (null if no change) */
  config: ConfigChange<TConfig> | null;
};

/**
 * Generic cache class for tracking file changes and configuration
 *
 * @template TConfig - Configuration object type for cache validation
 *
 * @example
 * ```typescript
 * type MyConfig = { outputDir: string; minify: boolean };
 * const cache = new Cache<MyConfig>("build");
 *
 * const config = { outputDir: "dist", minify: true };
 *
 * if (cache.shouldRecompile("abc123", config, "dist")) {
 *   // Perform compilation
 *   cache.save("abc123", config, ["file1.js", "file2.js"]);
 * }
 * ```
 */
export class Cache<TConfig extends Record<string, unknown>> {
  private cacheFilePath: string;
  private cache: CacheMetadata<TConfig> | null = null;
  private basePath: string;

  constructor(name: string, basePath?: string) {
    this.basePath = basePath ?? path.join(process.cwd(), ".tanstack");
    this.cacheFilePath = path.join(this.basePath, `${name}.json`);
  }

  /**
   * Read cache from disk (lazy load)
   * Returns null if cache doesn't exist or is corrupted
   */
  read(): CacheMetadata<TConfig> | null {
    // Return cached value if already loaded
    if (this.cache !== null) {
      return this.cache;
    }

    if (!existsSync(this.cacheFilePath)) {
      return null;
    }

    try {
      this.cache = fs.readJSONSync(this.cacheFilePath);
      return this.cache;
    } catch (_error: unknown) {
      console.warn("Failed to read cache metadata, will recompile");
      return null;
    }
  }

  /**
   * Compare current state with cache and return differences
   */
  diff(messagesFilesHash: string, config: TConfig): CacheDiff<TConfig> {
    const cache = this.read();

    if (!cache) {
      return {
        hasChanges: true,
        files: null,
        config: null,
      };
    }

    const diff: CacheDiff<TConfig> = {
      hasChanges: false,
      files: null,
      config: null,
    };

    // Check file changes
    if (cache.hash !== messagesFilesHash) {
      diff.hasChanges = true;
      diff.files = {
        oldHash: cache.hash,
        newHash: messagesFilesHash,
      };
    }

    // Check config changes using deep equality
    if (!isEqual(cache.config, config)) {
      diff.hasChanges = true;
      diff.config = {
        old: cache.config,
        new: config,
      };
    }

    return diff;
  }

  /**
   * Check if recompilation is needed
   * Returns true if files changed, config changed, or output missing
   */
  shouldRecompile(messagesFilesHash: string, config: TConfig, outDir: string): boolean {
    const diff = this.diff(messagesFilesHash, config);

    if (diff.hasChanges) {
      const reasons: string[] = [];
      if (diff.files) reasons.push("Message files changed");
      if (diff.config) reasons.push("Configuration changed");
      if (reasons.length === 0) reasons.push("Cache not found");

      console.debug(`[@raypx/bundler] ${reasons.join(", ")}, recompiling...`);
      return true;
    }

    // Check if output directory is missing (user may have cleaned it)
    if (!existsSync(outDir) || !existsSync(path.join(outDir, "runtime.js"))) {
      console.debug("[@raypx/bundler] Output directory missing, recompiling...");
      return true;
    }

    return false;
  }

  /**
   * Save cache to disk
   */
  save(messagesFilesHash: string, config: TConfig, messagesFiles: string[]): void {
    const metadata: CacheMetadata<TConfig> = {
      hash: messagesFilesHash,
      config,
      files: messagesFiles,
      timestamp: Date.now(),
    };

    fs.ensureFileSync(this.cacheFilePath);

    fs.writeJSONSync(this.cacheFilePath, metadata, { spaces: 2 });
    // Update in-memory cache
    this.cache = metadata;
  }

  /**
   * Clear cache file and in-memory cache
   */
  clear(): void {
    if (existsSync(this.cacheFilePath)) {
      fs.removeSync(this.cacheFilePath);
    }
    this.cache = null;
  }
}
