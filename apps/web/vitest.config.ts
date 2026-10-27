import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      maxWorkers: 3,
      projects: [
        {
          extends: true,
          test: { name: "unit", include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"] },
        },
        {
          extends: true,
          test: {
            name: "component",
            environment: "happy-dom",
            include: ["tests/component/**/*.{test,spec}.{ts,tsx}"],
            setupFiles: ["./tests/setup.ts"],
          },
        },
      ],
    },
  }),
);
