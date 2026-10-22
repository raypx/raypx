import { workspaceTests } from "../../test.config.js";
import { defineConfig } from "vite-plus/test/config";

export default defineConfig(({ mode }) => {
  switch (mode) {
    case "postgres":
      return workspaceTests({
        include: ["tests/postgres/node/**/*.{test,spec}.{ts,tsx}"],
        fileParallelism: false,
      });
    case "redis":
      return workspaceTests({
        include: ["tests/redis/**/*.{test,spec}.{ts,tsx}"],
        fileParallelism: false,
      });
    case "cloudflare-postgres":
      return workspaceTests({
        include: ["tests/postgres/cloudflare/**/*.{test,spec}.{ts,tsx}"],
        fileParallelism: false,
      });
    default:
      return workspaceTests({
        include: [
          "tests/unit/**/*.{test,spec}.{ts,tsx}",
          "tests/integration/**/*.{test,spec}.{ts,tsx}",
        ],
      });
  }
});
