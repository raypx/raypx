import { defineConfig, mergeConfig } from "vitest/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
      maxWorkers: 3,
      // Subprocess and daemon integration tests need time to start on busy hosts: a
      // fresh executable can take seconds to launch while other suites or a scanner run.
      // Cleanup hooks stop those processes, so they share the same budget.
      testTimeout: 60_000,
      hookTimeout: 60_000,
      expect: { poll: { timeout: 20_000 } },
    },
  }),
);
