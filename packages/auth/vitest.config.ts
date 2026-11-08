import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.ts";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "server",
            include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
            exclude: ["**/*.component.test.*"],
          },
        },
        {
          extends: true,
          test: {
            name: "component",
            environment: "happy-dom",
            include: ["src/**/*.component.test.{ts,tsx}"],
          },
        },
      ],
    },
  }),
);
