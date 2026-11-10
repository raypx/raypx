import { fileURLToPath } from "node:url";
import { nitroTarget } from "@raypx/tooling/build/nitro";
import { deploymentServices } from "@raypx/tooling/build/deployment";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

const handler = "./server/app/server.ts";
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    nitro({
      ...nitroTarget(),
      features: { websocket: true },
      serverAssets: [
        {
          baseName: "database-migrations",
          dir: fileURLToPath(
            new URL("../../packages/database/drizzle-foundation", import.meta.url),
          ),
          pattern: "*/migration.sql",
        },
      ],
      experimental: { tasks: true },
      tasks: {
        "maintenance:cleanup": {
          handler: fileURLToPath(new URL("./server/jobs/runtime/cleanup.ts", import.meta.url)),
        },
        "schedules:tick": {
          handler: fileURLToPath(new URL("./server/jobs/runtime/tick.ts", import.meta.url)),
        },
      },
      scheduledTasks: {
        "*/15 * * * *": ["maintenance:cleanup"],
        "* * * * *": ["schedules:tick"],
      },
      plugins: ["./server/runtime/plugin.ts"],
      routes: {
        "/relay": { handler: "./server/app/relay.ts" },
        "/api/auth/**": { handler, format: "web" },
        "/rpc/**": { handler, format: "web" },
        [deploymentServices.api.health]: { handler, format: "web" },
        [deploymentServices.api.ready]: { handler, format: "web" },
        "/**": { handler, format: "web" },
      },
    }),
  ],
  server: {
    port: deploymentServices.api.port,
    strictPort: true,
  },
});
