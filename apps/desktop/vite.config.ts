import { analyticsBuild } from "@raypx/tooling/build/analytics";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite-plus";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

const analytics = analyticsBuild();
function nativeApiConfig(): Plugin {
  let apiUrl = "http://localhost:3002";
  return {
    name: "raypx-native-api-config",
    configResolved(config) {
      apiUrl = config.env.VITE_API_URL || apiUrl;
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "runtime-config.json",
        source: JSON.stringify({ apiUrl }),
      });
    },
  };
}
export default defineConfig({
  ...analytics,
  plugins: [
    nativeApiConfig(),
    tailwindcss(),
    // SPA build only: the root shell is prerendered into dist/client/index.html,
    // which Electrobun serves from views://. There is no server for server functions.
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index" } } }),
    react(),
  ],
  resolve: {
    alias: electrobunViteAliases(resolve(import.meta.dirname, ".hutch/devkit")),
    // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
    watch: { ignored: ["**/.hutch/**", "**/build/**", "**/artifacts/**"] },
  },
});
