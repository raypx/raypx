import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      environment: "happy-dom",
      setupFiles: ["./tests/setup.ts"],
      maxWorkers: 3,
    },
  }),
);
