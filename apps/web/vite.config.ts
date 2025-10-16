import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
  server: {
    port: 3000,
  },
  build: {
    sourcemap: false,
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
    nitro(),
    tailwindcss(),
    tanstackStart({
      router: {
        routesDirectory: "app",
      },
    }),
    viteReact(),
  ],
});

export default config;
