import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus/test/config";

const domSetup = fileURLToPath(new URL("./packages/tooling/tests/setup/dom.ts", import.meta.url));

/** Runner defaults only. Each workspace owns test selection and customization. */
export default defineConfig({
  // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    environment: "node",
    // VP owns workspace parallelism; larger suites override this locally.
    maxWorkers: 1,
    execArgv: ["--no-env-file", "--no-install"],
    setupFiles: [domSetup],
    coverage: { provider: "v8", reporter: ["text", "json", "lcov"] },
  },
});
