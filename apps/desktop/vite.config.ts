import type { ViteUserConfig } from "vite-plus";
import { resolve } from "node:path";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import evlog from "@raypx/shared/logger/vite";

const isDevelopment = process.env.NODE_ENV !== "production";
const vitePlugins = [
  ...evlog({
    service: "desktop",
    pretty: isDevelopment,
    minLevel: isDevelopment ? "debug" : "info",
    client: {
      service: "desktop",
      console: true,
      pretty: isDevelopment,
      minLevel: isDevelopment ? "debug" : "info",
    },
  }),
  tailwindcss(),
  tanstackStart({
    rsc: { enabled: false },
    spa: {
      enabled: true,
      prerender: { outputPath: "/index" },
    },
  }),
  ...react(),
];
const config: ViteUserConfig = {
  resolve: {
    tsconfigPaths: true,
    alias: electrobunViteAliases(resolve(import.meta.dirname, ".hutch/devkit")),
  },
  // The plugin package and Vite+ can carry different Vite type instances.
  // Vite+ receives the same runtime plugin objects after this type boundary.
  plugins: vitePlugins as unknown as NonNullable<ViteUserConfig["plugins"]>,

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
    watch: { ignored: ["**/.hutch/**", "**/build/**", "**/artifacts/**"] },
  },
};

export default config;
