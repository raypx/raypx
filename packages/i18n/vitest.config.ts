import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: { name: "server", include: ["tests/node/**/*.{test,spec}.{ts,tsx}"] },
        },
        {
          extends: true,
          test: {
            name: "browser",
            environment: "happy-dom",
            include: ["tests/browser/**/*.{test,spec}.{ts,tsx}"],
          },
        },
      ],
    },
  }),
);
