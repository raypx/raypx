import { analyticsBuild } from "@raypx/tooling/build/analytics";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const analytics = analyticsBuild();
export default defineConfig(async ({ mode }) => {
  const preview = mode === "e2e" || process.env.RAYPX_DESKTOP_BROWSER_BUILD === "1";
  // Keep the optional native SDK outside the browser-acceptance config bundle.
  const alias = preview
    ? [
        {
          find: /^electrobun\/view$/,
          replacement: resolve(import.meta.dirname, "src/lib/unavailable-view.ts"),
        },
      ]
    : (
        (await import(
          pathToFileURL(resolve(import.meta.dirname, ".hutch/devkit/api/config/electrobun-vite.ts"))
            .href
        )) as typeof import("./.hutch/devkit/api/config/electrobun-vite")
      ).electrobunViteAliases(resolve(import.meta.dirname, ".hutch/devkit"));
  return {
    ...analytics,
    ...(preview ? { build: { outDir: "artifacts/browser" } } : {}),
    plugins: [
      tailwindcss(),
      // SPA build only: the root shell is prerendered into dist/client/index.html,
      // which Electrobun serves from views://. There is no server for server functions.
      tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index" } } }),
      react(),
    ],
    resolve: {
      alias,
      // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 1420,
      strictPort: true,
      host: "localhost",
      watch: { ignored: ["**/.hutch/**", "**/build/**", "**/artifacts/**"] },
    },
  };
});
