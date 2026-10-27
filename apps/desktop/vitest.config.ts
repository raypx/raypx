import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      maxWorkers: 3,
      // Native and script fixtures launch real subprocesses.
      testTimeout: 30_000,
    },
  }),
);
