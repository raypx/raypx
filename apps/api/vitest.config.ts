import { defineConfig, mergeConfig } from "vitest/config";
import defaults from "../../test.config.js";

export default defineConfig(({ mode }) => {
  switch (mode) {
    case "postgres":
      return mergeConfig(
        defaults,
        defineConfig({
          test: {
            include: ["tests/postgres/node/**/*.test.{ts,tsx}"],
            fileParallelism: false,
          },
        }),
      );
    case "redis":
      return mergeConfig(
        defaults,
        defineConfig({
          test: {
            include: ["tests/redis/**/*.test.{ts,tsx}"],
            fileParallelism: false,
          },
        }),
      );
    case "cluster":
      return mergeConfig(
        defaults,
        defineConfig({
          test: {
            include: ["tests/cluster/**/*.test.{ts,tsx}"],
            fileParallelism: false,
          },
        }),
      );
    default:
      return mergeConfig(
        defaults,
        defineConfig({
          test: {
            include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
          },
        }),
      );
  }
});
