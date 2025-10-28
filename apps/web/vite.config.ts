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
import * as sourceConfig from "./source.config";

const jiti = createJiti(import.meta.url);

// Environment variables
const env = await jiti.import<typeof import("./src/env").default>("./src/env", { default: true });

const isDev = env.NODE_ENV === "development";

export default defineConfig({
  server: {
    port: 3000,
    open: isDev,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // Workaround: fumadocs internally imports next/server which causes build errors
      external: ["next/server"],
    },
  },
  plugins: [
    i18nPlugin({
      outputStructure: isDev ? "locale-modules" : "message-modules",
    }),
    mdx(sourceConfig),
    // Always include for production tree-shaking
    devtools({
      enhancedLogs: { enabled: false },
      injectSource: { enabled: false },
    }),
    tsConfigPaths(),
    tanstackStart({
      router: { routesDirectory: "app" },
    }),
    // Must come after tanstackStart
    viteReact(),
    tailwindcss(),
    // Use nitro for dev + Vercel, netlify for other platforms
    isDev || env.VERCEL ? nitro() : netlify(),
  ],
});
