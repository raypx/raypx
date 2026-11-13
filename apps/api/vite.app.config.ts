import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import swaggerPackage from "swagger-ui-dist";
import {
  openApiAssets,
  openApiAssetsPath,
  openApiAssetStorage,
} from "./src/routers/openapi-paths.js";
import { nitroTarget } from "@raypx/tooling/build/nitro";
import { deploymentServices } from "@raypx/tooling/build/deployment";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

const handler = "./src/app/server.ts";
const swaggerDir = swaggerPackage.getAbsoluteFSPath();
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    nitro({
      ...nitroTarget(),
      serverEntry: "./src/app/entry.ts",
      features: { websocket: true },
      serverAssets: [
        {
          baseName: openApiAssetStorage,
          dir: swaggerDir,
          ignore: readdirSync(swaggerDir)
            .filter((file) => !openApiAssets.has(file))
            .map((file) => `**/${file}`),
        },
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
          handler: fileURLToPath(new URL("./src/jobs/runtime/cleanup.ts", import.meta.url)),
        },
        "schedules:tick": {
          handler: fileURLToPath(new URL("./src/jobs/runtime/tick.ts", import.meta.url)),
        },
      },
      scheduledTasks: {
        "*/15 * * * *": ["maintenance:cleanup"],
        "* * * * *": ["schedules:tick"],
      },
      plugins: ["./src/runtime/plugin.ts"],
      routes: {
        [`${openApiAssetsPath}/:asset`]: {
          handler: "./src/routers/openapi-assets.ts",
          method: "GET",
        },
        "/api/auth/**": { handler, format: "web" },
        "/.well-known/openid-configuration": { handler, format: "web" },
        "/.well-known/oauth-authorization-server": { handler, format: "web" },
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
