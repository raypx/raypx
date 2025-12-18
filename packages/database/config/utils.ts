/**
 * Shared utilities for Drizzle Kit configuration files
 */

import { createJiti } from "jiti";

/**
 * Load environment variables using jiti (handles workspace dependencies)
 * Falls back to process.env if jiti fails
 */
export function loadDatabaseUrl(envKey: string, fallbackKey?: string): string {
  let url: string | undefined;

  try {
    const jiti = createJiti(import.meta.url);
    // jiti.import is synchronous in config context
    const envsModule = jiti.import("../src/envs.ts") as unknown;

    if (
      envsModule &&
      typeof envsModule === "object" &&
      "envs" in envsModule &&
      typeof (envsModule as { envs?: unknown }).envs === "function"
    ) {
      const envs = (envsModule as { envs: () => Record<string, string | undefined> }).envs;
      const env = envs();
      url = env[envKey] || (fallbackKey ? env[fallbackKey] : undefined);
    }
  } catch {
    // jiti import failed, fallback to process.env
  }

  // Fallback to process.env (already loaded by raypx-scripts CLI)
  if (!url) {
    url = process.env[envKey] || (fallbackKey ? process.env[fallbackKey] : undefined);
  }

  return url || "";
}
