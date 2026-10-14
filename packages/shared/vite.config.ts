import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      "auth/index": "src/auth/index.ts",
      "cache/index": "src/cache/index.ts",
      "cache/env": "src/cache/env.ts",
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
        /^@voidmix\/env(?:\/|$)/,
        "@orpc/server",
        "evlog",
        "evlog/client",
        "evlog/hono",
        "evlog/orpc",
        "evlog/vite",
        "hono",
        "ioredis",
        "vite",
      ],
    },
  },
});
