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
                    include: ["src/**/*.test.ts"],
                    exclude: ["**/*.component.test.*"],
                  },
                },
                {
                  extends: true,
                  test: {
                    name: "component",
                    environment: "happy-dom",
                    setupFiles: ["./tests/setup.ts"],
                    include: ["src/**/*.component.test.tsx"],
                  },
                },
              ],
      },
    }),
  ),
);
