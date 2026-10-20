import { nitroTarget } from "@raypx/tooling/build/nitro";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

export default defineConfig(({ mode }) => {
  const cloudflare = mode === "cloudflare";
  return {
    ...(cloudflare ? { ssr: { noExternal: true as const } } : {}),
    plugins: [
      nitro({
        ...nitroTarget(mode, import.meta.url),
        // Trace React and React DOM together so both load the same NODE_ENV build.
        ...(!cloudflare ? { traceDeps: ["react", "react-dom"] } : {}),
      }),
      tailwindcss(),
      tanstackStart(),
      react(),
    ],
    build: {
      rolldownOptions: {
        // Base UI marks modules "use client" for RSC; this SSR app has no server components.
        onLog(level, log, handler) {
          if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
        },
      },
    },
    // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
    resolve: { dedupe: ["react", "react-dom"] },
    server: { port: 3000, strictPort: true },
  };
});
