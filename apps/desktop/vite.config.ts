import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react()],
  resolve: { alias: electrobunViteAliases(resolve(import.meta.dirname, ".hutch/devkit")) },
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
    watch: { ignored: ["**/.hutch/**", "**/build/**", "**/artifacts/**"] },
  },
  build: { outDir: "dist" },
});
