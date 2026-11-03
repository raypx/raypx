import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    // Shared task views and fixture providers must use the same Query context.
    resolve: { dedupe: ["@tanstack/react-query"] },
    test: {
      include: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "scripts/**/*.{test,spec}.{ts,tsx}",
        "*.test.ts",
        "tests/**/*.{test,spec}.{ts,tsx}",
      ],
      maxWorkers: 3,
      // Native and script fixtures launch real subprocesses.
      testTimeout: 30_000,
    },
  }),
);
