import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
      maxWorkers: 4,
      // Process and filesystem fixtures need room on slower runners.
      testTimeout: 30_000,
      unstubEnvs: true,
      unstubGlobals: true,
    },
  }),
);
