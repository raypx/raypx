/**
 * Vite utility functions
 */

import type { PluginOption } from "vite";

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Check if running in production mode
 */
export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Get environment variable with fallback
 */
export function getEnv(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

/**
 * Get port from environment or use default
 */
export function getPort(defaultPort = 3000): number {
  const port = process.env.PORT;
  if (port) {
    const parsed = Number.parseInt(port, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return defaultPort;
}

/**
 * Merge multiple plugin arrays, filtering out null/undefined
 */
export function mergePlugins(
  ...pluginArrays: (PluginOption | null | undefined)[][]
): PluginOption[] {
  return pluginArrays.flat().filter((plugin): plugin is PluginOption => plugin != null);
}

/**
 * Create a plugin that runs only once
 */
export function oncePlugin(plugin: PluginOption): PluginOption {
  let initialized = false;

  return {
    ...plugin,
    name: `once:${plugin.name || "unknown"}`,
    buildStart() {
      if (!initialized) {
        initialized = true;
        if (typeof plugin.buildStart === "function") {
          return plugin.buildStart.call(this);
        }
      }
    },
    configResolved(config) {
      if (!initialized) {
        initialized = true;
        if (typeof plugin.configResolved === "function") {
          return plugin.configResolved.call(this, config);
        }
      }
    },
  };
}
