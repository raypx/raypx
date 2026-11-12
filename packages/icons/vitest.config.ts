import { defineConfig, mergeConfig } from "vitest/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({ test: { include: ["src/**/*.component.test.tsx"], environment: "happy-dom" } }),
);
