import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import netlify from "@netlify/vite-plugin-tanstack-start";
import inlangSettings from "@raypx/i18n/inlang";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { createJiti } from "jiti";
import { trimEnd } from "lodash-es";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const require = createRequire(import.meta.url);

const jiti = createJiti(import.meta.url);

const urls = ["/", "/:path(.*)?"];
const outDir = ".output";

const urlPatterns = urls.map((u) => ({
  pattern: u,
  localized: inlangSettings.locales.map((l) => [l, trimEnd(join("/", l, u), "/")]),
})) satisfies { pattern: string; localized: [string, string][] }[];

const config = defineConfig(async ({ mode }) => {
  const env: Record<string, string> = await jiti.import("./src/env.ts", { default: true });

  const isDev = mode === "development" || env.NODE_ENV === "development";
  return {
    server: {
      port: 3000,
      open: isDev,
    },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: { external: ["next/server"] },
    },
    ssr: { noExternal: ["urlpattern-polyfill"] },
    plugins: [
      paraglideVitePlugin({
        project: join(dirname(require.resolve("@raypx/i18n")), "inlang"),
        outdir: join(dirname(require.resolve("@raypx/i18n")), "paraglide"),
        cookieName: "lang",
        strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
        urlPatterns,
      }),
      mdx(await import("./source.config"), { outDir: `./${outDir}/.source` }),
      devtools({
        enhancedLogs: {
          enabled: false,
        },
        injectSource: {
          enabled: false,
        },
      }),
      tsConfigPaths(),
      process.env.VERCEL || isDev ? nitro() : netlify(),
      tailwindcss(),
      tanstackStart({
        router: {
          routesDirectory: "app",
          generatedRouteTree: `../${outDir}/route-tree.ts`,
        },
      }),
      viteReact(),
    ],
  };
});

export default config;
