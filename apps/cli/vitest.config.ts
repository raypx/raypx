import { defineConfig, mergeConfig } from "vitest/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
      maxWorkers: 3,
      // Subprocess and daemon integration tests need time to start on busy hosts.
      testTimeout: 30_000,
      expect: { poll: { timeout: 10_000 } },
    },
  }),
);
