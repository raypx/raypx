import { packageConfig, workspaceCacheInputs } from "@raypx/config/vite";
import { defineConfig } from "vite-plus";

const config = packageConfig(import.meta.url, {
  name: "ui",
  test: true,
  react: true,
  dom: true,
  styles: true,
});
const storybookInputs = [
  ...workspaceCacheInputs(import.meta.url),
  ".storybook/**",
  "stories/**",
  "vitest.config.ts",
];

export default defineConfig({
  ...config,
  run: {
    ...config.run,
    tasks: {
      ...config.run?.tasks,
      typecheck: {
        command: "tsc --noEmit && tsc -p tsconfig.test.json",
        dependsOn: [{ task: "build", from: "dependencies" }],
        cache: { input: storybookInputs, output: [] },
      },
      test: {
        command: "vp test run --config vite.config.ts",
        cache: { input: workspaceCacheInputs(import.meta.url), output: [] },
      },
      storybook: {
        command: "storybook dev --port 6006 --host 127.0.0.1 --no-open --disable-telemetry",
        cache: false,
      },
      "storybook-build": {
        command: "storybook build --disable-telemetry",
        cache: { input: storybookInputs, output: ["storybook-static/**"] },
      },
      "storybook-test": {
        command: "vp test run --config vitest.config.ts",
        cache: false,
      },
      "storybook-install": { command: "playwright install chromium", cache: false },
    },
  },
});
