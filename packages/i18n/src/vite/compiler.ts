import crypto from "node:crypto";
import { compile } from "@inlang/paraglide-js";
import { Cache } from "@raypx/bundler";
import fg from "fast-glob";
import fs from "fs-extra";
import type { Strategy } from "../types";
import type { I18nCacheConfig } from "./types";

/**
 * Calculate hash for message files to detect changes
 */
export function calculateMessagesHash(params: { cwd: string; pattern: string }): {
  hash: string;
  files: string[];
} {
  const source = params.pattern.replace("{locale}", "*");
  const messagesFiles = fg.sync(source, { onlyFiles: true, cwd: params.cwd }).sort();
  const hash = crypto.createHash("md5");

  for (const file of messagesFiles) {
    const stat = fs.statSync(file);
    hash.update(`${file}:${stat.mtimeMs}:${stat.size}`);
  }

  return {
    hash: hash.digest("hex"),
    files: messagesFiles,
  };
}

/**
 * Compile paraglide if needed
 * Uses cache to avoid unnecessary recompilation
 */
export async function ensureParaglideCompiled(params: {
  messagesFilesHash: string;
  outputStructure: "locale-modules" | "message-modules";
  cookieName: string;
  strategy: Strategy[];
  inlangDir: string;
  outDir: string;
  projectPath: string;
  urlPatterns: { pattern: string; localized: [string, string][] }[];
  messagesFiles: string[];
}): Promise<void> {
  const cache = new Cache<I18nCacheConfig>("i18n");
  const cacheConfig: I18nCacheConfig = {
    outputStructure: params.outputStructure,
    cookieName: params.cookieName,
    strategy: params.strategy,
    inlangDir: params.inlangDir,
  };

  if (cache.shouldRecompile(params.messagesFilesHash, cacheConfig, params.outDir)) {
    await compile({
      project: params.projectPath,
      outdir: params.outDir,
      outputStructure: params.outputStructure,
      cookieName: params.cookieName,
      strategy: params.strategy,
      urlPatterns: params.urlPatterns,
    });
    cache.save(params.messagesFilesHash, cacheConfig, params.messagesFiles);
  }
}
