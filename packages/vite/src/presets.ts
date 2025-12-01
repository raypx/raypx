/**
 * Vite plugin presets for common configurations
 */

import type { PluginOption } from "vite";
import { conditionalPlugin, envPlugin } from "./plugins";
import { isDev } from "./utils";

/**
 * Create deployment plugin based on environment
 *
 * Automatically selects the correct deployment plugin:
 * - Vercel: nitro plugin
 * - Netlify: netlify plugin
 * - Other: no plugin
 *
 * @example
 * ```ts
 * import { createDeployPlugin } from "@raypx/vite/presets";
 * import { nitro } from "nitro/vite";
 * import netlify from "@netlify/vite-plugin-tanstack-start";
 *
 * export default defineConfig({
 *   plugins: [
 *     createDeployPlugin({
 *       vercel: () => nitro(),
 *       netlify: () => netlify(),
 *     }),
 *   ],
 * });
 * ```
 */
export function createDeployPlugin(options: {
  vercel?: () => PluginOption;
  netlify?: () => PluginOption;
}): PluginOption | null {
  const { vercel, netlify } = options;

  // Check for Vercel
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return vercel?.() ?? null;
  }

  // Check for Netlify
  if (process.env.NETLIFY || process.env.NETLIFY_DEV) {
    return netlify?.() ?? null;
  }

  return null;
}

/**
 * Create React plugin with React Compiler support
 *
 * Note: This is a helper function. You still need to install @vitejs/plugin-react.
 *
 * @example
 * ```ts
 * import { createReactPlugin } from "@raypx/vite/presets";
 * import viteReact from "@vitejs/plugin-react";
 *
 * export default defineConfig({
 *   plugins: [
 *     createReactPlugin(viteReact, {
 *       compiler: { target: "19" },
 *     }),
 *   ],
 * });
 * ```
 */
export function createReactPlugin(
  viteReact: typeof import("@vitejs/plugin-react").default,
  options?: {
    compiler?: {
      target?: string;
      enabled?: boolean;
    };
  },
): PluginOption {
  const { compiler } = options ?? {};
  const compilerEnabled = compiler?.enabled ?? true;

  return viteReact({
    babel: compilerEnabled
      ? {
          plugins: [
            [
              "babel-plugin-react-compiler",
              {
                target: compiler?.target ?? "19",
              },
            ],
          ],
        }
      : undefined,
  });
}

/**
 * Create devtools plugin configuration
 *
 * Note: This is a helper function. You still need to install @tanstack/devtools-vite.
 *
 * @example
 * ```ts
 * import { createDevtoolsPlugin } from "@raypx/vite/presets";
 * import { devtools } from "@tanstack/devtools-vite";
 *
 * export default defineConfig({
 *   plugins: [
 *     createDevtoolsPlugin(devtools, {
 *       enhancedLogs: false,
 *       injectSource: false,
 *     }),
 *   ],
 * });
 * ```
 */
export function createDevtoolsPlugin(
  devtools: typeof import("@tanstack/devtools-vite").devtools,
  options?: {
    enhancedLogs?: boolean;
    injectSource?: boolean;
  },
): PluginOption {
  return devtools({
    enhancedLogs: { enabled: options?.enhancedLogs ?? false },
    injectSource: { enabled: options?.injectSource ?? false },
  });
}

/**
 * Create inspect plugin (dev only)
 *
 * Note: This is a helper function. You still need to install vite-plugin-inspect.
 *
 * @example
 * ```ts
 * import { createInspectPlugin } from "@raypx/vite/presets";
 * import Inspect from "vite-plugin-inspect";
 *
 * export default defineConfig({
 *   plugins: [
 *     createInspectPlugin(Inspect), // Only enabled in development
 *   ],
 * });
 * ```
 */
export function createInspectPlugin(
  Inspect: typeof import("vite-plugin-inspect").default,
): PluginOption | null {
  return conditionalPlugin(Inspect(), isDev());
}

/**
 * Create TanStack Start preset
 *
 * Common plugins configuration for TanStack Start applications
 *
 * Note: You need to install the required plugins as dependencies.
 *
 * @example
 * ```ts
 * import { createTanstackStartPreset } from "@raypx/vite/presets";
 * import { devtools } from "@tanstack/devtools-vite";
 * import { tanstackStart } from "@tanstack/react-start/plugin/vite";
 * import viteReact from "@vitejs/plugin-react";
 * import Inspect from "vite-plugin-inspect";
 * import tsConfigPaths from "vite-tsconfig-paths";
 *
 * export default defineConfig({
 *   plugins: [
 *     ...createTanstackStartPreset({
 *       react: viteReact,
 *       devtools,
 *       inspect: Inspect,
 *       tsConfigPaths,
 *       reactOptions: { compiler: { target: "19" } },
 *     }),
 *     tanstackStart(),
 *   ],
 * });
 * ```
 */
export function createTanstackStartPreset(options: {
  react: typeof import("@vitejs/plugin-react").default;
  devtools: typeof import("@tanstack/devtools-vite").devtools;
  inspect: typeof import("vite-plugin-inspect").default;
  tsConfigPaths: typeof import("vite-tsconfig-paths").default;
  reactOptions?: {
    compiler?: {
      target?: string;
      enabled?: boolean;
    };
  };
  devtoolsOptions?: {
    enhancedLogs?: boolean;
    injectSource?: boolean;
  };
  enableInspect?: boolean;
  enableTsConfigPaths?: boolean;
}): PluginOption[] {
  const plugins: PluginOption[] = [];

  // React plugin
  plugins.push(createReactPlugin(options.react, options.reactOptions));

  // Devtools (always included for tree-shaking)
  plugins.push(createDevtoolsPlugin(options.devtools, options.devtoolsOptions));

  // Inspect plugin (dev only)
  if (options.enableInspect !== false) {
    const inspect = createInspectPlugin(options.inspect);
    if (inspect) {
      plugins.push(inspect);
    }
  }

  // TypeScript paths
  if (options.enableTsConfigPaths !== false) {
    plugins.push(options.tsConfigPaths());
  }

  return plugins;
}
