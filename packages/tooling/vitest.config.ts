import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.ts";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
      // Graph and cache fixtures start independent task runners.
      testTimeout: 30_000,
    },
  }),
);
