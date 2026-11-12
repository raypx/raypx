import { defineConfig, mergeConfig } from "vitest/config";
import defaults from "../../test.config.js";

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
            include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}", "*.test.ts"],
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
            include: ["tests/integration/**/*.test.{ts,tsx}"],
            testTimeout: 30_000,
          },
        },
      ],
      maxWorkers: 3,
    },
  }),
);
