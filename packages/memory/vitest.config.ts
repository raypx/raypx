import { defineConfig, mergeConfig } from "vitest/config";
import defaults from "../../test.config.js";

export default defineConfig(({ mode }) =>
  mergeConfig(
    defaults,
    defineConfig({
      test: {
        include:
          mode === "postgres"
            ? ["tests/postgres/**/*.test.ts"]
            : ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
        exclude: mode === "postgres" ? [] : ["tests/postgres/**"],
      },
    }),
  ),
);
