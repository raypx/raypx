import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../vitest.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    },
  }),
);
