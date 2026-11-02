import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "server",
            include: ["src/**/*.{test,spec}.{ts,tsx}"],
            exclude: ["**/*.component.test.*"],
          },
        },
        {
          extends: true,
          test: {
            name: "browser",
            environment: "happy-dom",
            include: ["src/**/*.component.test.{ts,tsx}"],
          },
        },
      ],
    },
  }),
);
