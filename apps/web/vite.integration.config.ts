import { fileURLToPath } from "node:url";
import { workspaceSourceAliases } from "@raypx/config/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: false,
  resolve: { alias: workspaceSourceAliases() },
  test: {
    name: "web-integration",
    environment: "node",
    include: ["test/integration/**/*.{test,spec}.{ts,tsx}"],
    // Each file owns its Bun service and optional SQLite fixture.
    maxWorkers: 2,
  },
});
