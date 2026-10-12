import { defineConfig } from "nitro";

export default defineConfig({
  compatibilityDate: "2026-08-23",
  devServer: { port: 3002, hostname: "localhost" },
  plugins: ["./server/runtime.plugin.ts"],
  routes: {
    "/api/auth/**": { handler: "./server/app.ts", format: "web" },
    "/api/cloud/storage/**": { handler: "./server/app.ts", format: "web" },
    "/internal/execution/**": { handler: "./server/app.ts", format: "web" },
    "/rpc/**": { handler: "./server/app.ts", format: "web" },
    "/health": { handler: "./server/app.ts", format: "web" },
  },
  serverDir: false,
  serverEntry: false,
});
