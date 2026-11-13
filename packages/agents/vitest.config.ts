import { defineConfig, mergeConfig } from "vitest/config";
import defaults from "../../test.config.js";

export default defineConfig(({ mode }) =>
  mergeConfig(
    defaults,
    defineConfig({
      test: {
        projects:
          mode === "postgres"
            ? [
                {
                  extends: true,
                  test: { name: "postgres", include: ["tests/postgres/**/*.test.ts"] },
                },
              ]
            : [
                {
                  extends: true,
                  test: {
                    name: "unit",
                    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
                    exclude: ["**/*.component.test.*"],
                  },
                },
                {
                  extends: true,
                  test: {
                    name: "component",
                    environment: "happy-dom",
                    include: ["src/**/*.component.test.tsx"],
                    setupFiles: ["./tests/setup.ts"],
                  },
                },
              ],
        fileParallelism: false,
      },
    }),
  ),
);
