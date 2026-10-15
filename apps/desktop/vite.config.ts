import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    // SPA build only: the root shell is prerendered into dist/client/index.html,
    // which Electrobun serves from views://. There is no server for server functions.
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index" } } }),
    react(),
  ],
  resolve: { alias: electrobunViteAliases(resolve(import.meta.dirname, ".hutch/devkit")) },
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
    watch: { ignored: ["**/.hutch/**", "**/build/**", "**/artifacts/**"] },
  },
});
