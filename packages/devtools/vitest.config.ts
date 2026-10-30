import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      projects: [
        { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
        {
          extends: true,
          test: {
            name: "component",
            environment: "happy-dom",
            environmentOptions: {
              happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } },
            },
            include: ["tests/component/**/*.test.tsx"],
          },
        },
      ],
    },
  }),
);
