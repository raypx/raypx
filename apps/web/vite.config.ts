import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import evlog from "@voidmix/shared/logger/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins:
    lazyPlugins(() => [
      evlog({
        service: "web",
      }),
      nitro({
        compatibilityDate: "2026-08-23",
        devServer: { hostname: "localhost" },
        preset: "node-server",
        routes: { "/health": { handler: "./server/health.ts", format: "web" } },
        serverDir: false,
        serverEntry: false,
        // The node-server trace must retain React for the TanStack SSR entry.
        // The runtime probe requests `/`, so removal is verified against the built artifact.
        traceDeps: ["react"],
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact({ compiler: true }),
    ]) ?? [],
  server: { port: 3000, strictPort: true },
});

export default config;
