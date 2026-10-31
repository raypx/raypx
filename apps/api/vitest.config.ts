import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default defineConfig(({ mode }) => {
  switch (mode) {
    case "postgres":
      return mergeConfig(
        defaults,
        defineConfig({
          test: {
            include: ["tests/postgres/node/**/*.{test,spec}.{ts,tsx}"],
            fileParallelism: false,
          },
        }),
      );
    case "redis":
      return mergeConfig(
        defaults,
        defineConfig({
          test: {
            include: ["tests/redis/**/*.{test,spec}.{ts,tsx}"],
            fileParallelism: false,
          },
        }),
      );
    case "cluster":
      return mergeConfig(
        defaults,
        defineConfig({
          test: {
            include: ["tests/cluster/**/*.{test,spec}.{ts,tsx}"],
            fileParallelism: false,
          },
        }),
      );
    default:
      return mergeConfig(
        defaults,
        defineConfig({
          test: {
            include: [
              "tests/unit/**/*.{test,spec}.{ts,tsx}",
              "tests/integration/**/*.{test,spec}.{ts,tsx}",
            ],
          },
        }),
      );
  }
});
