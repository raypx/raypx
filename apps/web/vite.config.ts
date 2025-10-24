import { paraglideVitePlugin } from "@inlang/paraglide-js";
import netlify from "@netlify/vite-plugin-tanstack-start";
import { getI18nConfig } from "@raypx/i18n";
import vitePlugin from "@raypx/vite/plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { createJiti } from "jiti";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const jiti = createJiti(import.meta.url);

const i18nConfig = getI18nConfig(import.meta.dirname);
const outDir = '.output';

console.log(JSON.stringify(i18nConfig, null, 2));

const config = defineConfig(async ({ mode }) => {
  const env: Record<string, string> = await jiti.import("./src/env.ts", { default: true });

  const isDev = mode === "development" || env.NODE_ENV === "development";
  return {
    server: {
      open: isDev,
    },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: { external: ["next/server"] },
    },
    ssr: { noExternal: ["urlpattern-polyfill"] },
    plugins: [
      vitePlugin(),
      paraglideVitePlugin({
        project: i18nConfig.project,
        outdir: i18nConfig.outDir,
        outputStructure: "message-modules",
        cookieName: "lang",
        strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
        urlPatterns: i18nConfig.urlPatterns,
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
