import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    nitro({
      preset: "node-server",
      compatibilityDate: "2026-10-15",
      devServer: { hostname: "localhost" },
      serverDir: false,
      serverEntry: false,
      // Trace React and React DOM together so both load the same NODE_ENV build.
      traceDeps: ["react", "react-dom"],
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
  server: { port: 3000, strictPort: true },
});
