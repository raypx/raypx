import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.ts";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    },
  }),
);
