import { analyticsBuild } from "@raypx/tooling/build/analytics";
import { startEnvironment } from "@raypx/tooling/build/start-env";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

const analytics = analyticsBuild();
export default defineConfig(({ mode }) => {
  const preview = mode === "e2e" || process.env.RAYPX_DESKTOP_BROWSER_BUILD === "1";
  return {
    ...analytics,
    ...(preview ? { build: { outDir: "artifacts/browser" } } : {}),
    plugins: [
      tailwindcss(),
      // SPA build only: the root shell is prerendered into dist/client/index.html,
      // which the native WebView serves. There is no server for server functions.
      startEnvironment(
        tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index" } } }),
        loadEnv,
      ),
      react(),
    ],
    resolve: {
      // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 1420,
      strictPort: true,
      host: "localhost",
      watch: { ignored: ["**/src-tauri/**", "**/artifacts/**"] },
    },
  };
});
