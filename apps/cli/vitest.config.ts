import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      maxWorkers: 3,
      // Subprocess and daemon integration tests need time to start on busy hosts.
      testTimeout: 30_000,
      expect: { poll: { timeout: 10_000 } },
    },
  }),
);
