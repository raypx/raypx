import { existsSync } from "node:fs";
import path from "node:path";
import fs from "fs-extra";
import { isEqual } from "lodash-es";
import type { Strategy } from "./vite";

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
  /** List of change reasons */
  reasons: string[];
  /** File change details (null if no change) */
  files: FileChange | null;
  /** Config change details (null if no change) */
  config: ConfigChange<TConfig> | null;
};

/**
 * i18n specific cache configuration
 */
export type I18nCacheConfig = {
  outputStructure: "locale-modules" | "message-modules";
  cookieName: string;
  strategy: Strategy[];
  inlangDir: string;
};

/**
 * Generic cache class for tracking file changes and configuration
 *
 * @template TConfig - Configuration object type for cache validation
 *
 * @example
 * ```typescript
 * const cache = new Cache<I18nCacheConfig>("/path/to/cache.json");
 *
 * const config = {
 *   outputStructure: "message-modules",
 *   cookieName: "lang",
 *   strategy: ["url", "cookie"],
 *   inlangDir: "inlang",
 * };
 *
 * if (cache.shouldRecompile("abc123", config, "dist")) {
 *   // Perform compilation
 *   cache.save("abc123", config, ["en.json", "zh.json"]);
 * }
 * ```
 */
export class Cache<TConfig extends Record<string, unknown>> {
  private cacheFilePath: string;
  private cache: CacheMetadata<TConfig> | null = null;

  constructor(cacheFilePath: string) {
    this.cacheFilePath = cacheFilePath;
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
      console.warn("[@raypx/i18n] Failed to read cache metadata, will recompile");
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
        reasons: ["Cache not found"],
        files: null,
        config: null,
      };
    }

    const diff: CacheDiff<TConfig> = {
      hasChanges: false,
      reasons: [],
      files: null,
      config: null,
    };

    // Check file changes
    if (cache.hash !== messagesFilesHash) {
      diff.hasChanges = true;
      diff.reasons.push("Message files changed");
      diff.files = {
        oldHash: cache.hash,
        newHash: messagesFilesHash,
      };
    }

    // Check config changes using deep equality
    if (!isEqual(cache.config, config)) {
      diff.hasChanges = true;
      diff.reasons.push("Configuration changed");
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
      console.log(`[@raypx/i18n] ${diff.reasons.join(", ")}, recompiling...`);
      return true;
    }

    // Check if output directory is missing (user may have cleaned it)
    if (!existsSync(outDir) || !existsSync(path.join(outDir, "runtime.js"))) {
      console.log("[@raypx/i18n] Output directory missing, recompiling...");
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

    fs.writeJSONSync(this.cacheFilePath, metadata, { spaces: 2 });
    this.cache = metadata; // Update in-memory cache
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
