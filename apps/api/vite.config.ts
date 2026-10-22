import { fileURLToPath } from "node:url";
import { nitroTarget } from "@raypx/tooling/build/nitro";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

export default defineConfig(({ mode }) => {
  const cloudflare = mode === "cloudflare";
  const handler = cloudflare ? "./server/app/cloudflare.ts" : "./server/app/node.ts";
  return {
    resolve: { tsconfigPaths: true },
    ...(cloudflare ? { ssr: { noExternal: true as const } } : {}),
    plugins: [
      nitro({
        ...nitroTarget(mode, import.meta.url),
        features: { websocket: !cloudflare },
        experimental: { tasks: true },
        tasks: {
          "maintenance:cleanup": {
            handler: fileURLToPath(
              new URL(
                `./server/jobs/runtime/${cloudflare ? "cloudflare" : "node"}.ts`,
                import.meta.url,
              ),
            ),
          },
        },
        scheduledTasks: { "*/15 * * * *": ["maintenance:cleanup"] },
        ...(!cloudflare ? { plugins: ["./server/runtime/plugin.ts"] } : {}),
        routes: {
          ...(!cloudflare
            ? { "/relay": { handler: "./server/relay/node.ts", format: "web" as const } }
            : {}),
          "/api/auth/**": { handler, format: "web" },
          "/rpc/**": { handler, format: "web" },
          "/health": { handler, format: "web" },
          "/**": { handler, format: "web" },
        },
      }),
    ],
    server: { port: 3002, strictPort: true },
  };
});
