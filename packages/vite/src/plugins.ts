/**
 * Vite plugins and plugin utilities
 */

import type { PluginOption } from "vite";
import type { VirtualModuleConfig } from "./types";

/**
 * Create a virtual module plugin
 *
 * Virtual modules allow you to inject code at build time.
 * Useful for environment variables, configuration, or dynamic imports.
 *
 * @example
 * ```ts
 * import { createVirtualModulePlugin } from "@raypx/vite/plugins";
 *
 * export default defineConfig({
 *   plugins: [
 *     createVirtualModulePlugin({
 *       id: "my-config",
 *       content: () => `export const config = ${JSON.stringify({ foo: "bar" })}`,
 *     }),
 *   ],
 * });
 * ```
 */
export function createVirtualModulePlugin(config: VirtualModuleConfig): PluginOption {
  const virtualId = `virtual:${config.id}`;
  const resolvedId = `\0${virtualId}`;

  return {
    name: `virtual-module:${config.id}`,
    enforce: "pre",
    resolveId(id) {
      if (id === virtualId) {
        return resolvedId;
      }
      return null;
    },
    async load(id) {
      if (id === resolvedId) {
        return await config.content();
      }
      return null;
    },
  };
}

/**
 * Conditional plugin wrapper
 *
 * Conditionally enable/disable plugins based on environment or other conditions.
 *
 * @example
 * ```ts
 * import { conditionalPlugin } from "@raypx/vite/plugins";
 *
 * export default defineConfig({
 *   plugins: [
 *     conditionalPlugin(
 *       somePlugin(),
 *       process.env.NODE_ENV === "development",
 *     ),
 *   ],
 * });
 * ```
 */
export function conditionalPlugin(
  plugin: PluginOption | null | undefined,
  condition: boolean,
): PluginOption | null {
  if (!plugin || !condition) {
    return null;
  }
  return plugin;
}

/**
 * Environment-aware plugin wrapper
 *
 * Enable plugins only in specific environments.
 *
 * @example
 * ```ts
 * import { envPlugin } from "@raypx/vite/plugins";
 *
 * export default defineConfig({
 *   plugins: [
 *     envPlugin(somePlugin(), {
 *       dev: true,
 *       prod: false,
 *     }),
 *   ],
 * });
 * ```
 */
export function envPlugin(
  plugin: PluginOption,
  options: { dev?: boolean; prod?: boolean } = {},
): PluginOption | null {
  const isDev = process.env.NODE_ENV === "development";
  const isProd = process.env.NODE_ENV === "production";

  const { dev = false, prod = true } = options;

  if ((isDev && dev) || (isProd && prod)) {
    return plugin;
  }

  return null;
}

/**
 * Plugin array utilities
 */
export const plugins = {
  /**
   * Filter out null/undefined plugins
   */
  filter: (plugins: (PluginOption | null | undefined)[]): PluginOption[] => {
    return plugins.filter((plugin): plugin is PluginOption => plugin != null);
  },

  /**
   * Flatten nested plugin arrays
   */
  flatten: (plugins: PluginOption[]): PluginOption[] => {
    return plugins.flat();
  },
};
