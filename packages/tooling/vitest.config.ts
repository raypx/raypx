import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      // Graph and cache fixtures start independent task runners.
      testTimeout: 30_000,
    },
  }),
);
