import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { workspaceCacheInputs } from "./src/vite.ts";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: { name: "config", environment: "node", include: ["test/**/*.{test,spec}.ts"] },
  run: {
    tasks: {
      typecheck: {
        command: "tsc -p tsconfig.test.json",
        cache: { input: workspaceCacheInputs(import.meta.url), output: [] },
      },
      test: {
        command: "vp test run",
        cache: { input: workspaceCacheInputs(import.meta.url), output: [] },
      },
    },
  },
});
