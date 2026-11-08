import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.ts";

export default mergeConfig(
  defaults,
  defineConfig({
    // Shared task views and fixture providers must use the same Query context.
    resolve: { dedupe: ["@tanstack/react-query"] },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            include: [
              "src/**/*.{test,spec}.{ts,tsx}",
              "scripts/**/*.{test,spec}.{ts,tsx}",
              "*.test.ts",
            ],
            exclude: ["**/*.component.test.*"],
          },
        },
        {
          extends: true,
          test: {
            name: "component",
            environment: "happy-dom",
            include: ["src/**/*.component.test.{ts,tsx}", "*.component.test.tsx"],
          },
        },
        {
          extends: true,
          test: {
            name: "integration",
            include: ["tests/integration/**/*.{test,spec}.{ts,tsx}"],
            testTimeout: 30_000,
          },
        },
      ],
      maxWorkers: 3,
    },
  }),
);
