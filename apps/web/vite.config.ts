import netlify from "@netlify/vite-plugin-tanstack-start";
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
      rollupOptions: {
        external: ["next/server"],
      },
    },
    plugins: [
      mdx(await import("./source.config")),
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
        },
      }),
      viteReact(),
    ],
  };
});

export default config;
