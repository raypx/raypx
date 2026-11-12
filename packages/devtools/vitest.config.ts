import { defineConfig, mergeConfig } from "vitest/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["**/*.component.test.*"] },
        },
        {
          extends: true,
          test: {
            name: "component",
            environment: "happy-dom",
            environmentOptions: {
              happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } },
            },
            include: ["src/**/*.component.test.tsx"],
          },
        },
      ],
    },
  }),
);
