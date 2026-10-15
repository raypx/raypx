import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    nitro({
      preset: "node-server",
      compatibilityDate: "2026-10-15",
      devServer: { hostname: "localhost" },
      plugins: ["./server/runtime.plugin.ts"],
      routes: {
        "/api/auth/**": { handler: "./server/app.ts", format: "web" },
        "/rpc/**": { handler: "./server/app.ts", format: "web" },
        "/health": { handler: "./server/app.ts", format: "web" },
        "/**": { handler: "./server/app.ts", format: "web" },
      },
      serverDir: false,
      serverEntry: false,
    }),
  ],
  server: { port: 3002, strictPort: true },
});
