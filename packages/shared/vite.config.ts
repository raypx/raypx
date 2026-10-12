import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      "env/index": "src/env/index.ts",
      "env/runtime": "src/env/runtime.ts",
      "logger/index": "src/logger/index.ts",
      "logger/client": "src/logger/client.ts",
      "logger/env": "src/logger/env.ts",
      "logger/hono": "src/logger/hono.ts",
      "logger/orpc": "src/logger/orpc.ts",
      "logger/vite": "src/logger/vite.ts",
    },
    dts: true,
    format: ["esm"],
    sourcemap: true,
    deps: {
      neverBundle: [
        "@orpc/server",
        "evlog",
        "evlog/client",
        "evlog/hono",
        "evlog/orpc",
        "evlog/vite",
        "hono",
        "vite",
        "zod",
      ],
    },
  },
});
