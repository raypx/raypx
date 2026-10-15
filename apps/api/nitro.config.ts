import { defineConfig } from "nitro";
export default defineConfig({
  preset: "node-server",
  compatibilityDate: "2026-10-15",
  devServer: { port: 3002, hostname: "localhost" },
  plugins: ["./server/runtime.plugin.ts"],
  publicAssets: [{ dir: "../web/dist", baseURL: "/", fallthrough: true }],
  serverAssets: [{ baseName: "web", dir: "../web/dist", pattern: "index.html" }],
  routes: {
    "/api/auth/**": { handler: "./server/app.ts", format: "web" },
    "/rpc/**": { handler: "./server/app.ts", format: "web" },
    "/health": { handler: "./server/app.ts", format: "web" },
    "/**": { handler: "./server/app.ts", format: "web" },
  },
  serverDir: false,
  serverEntry: false,
});
