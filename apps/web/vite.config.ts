import netlify from "@netlify/vite-plugin-tanstack-start";
import i18nPlugin from "@raypx/i18n/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { createJiti } from "jiti";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const outDir = ".output";
const jiti = createJiti(import.meta.url);

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
      i18nPlugin({
        outputStructure: isDev ? "locale-modules" : "message-modules",
        cookieName: "lang",
        strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
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
