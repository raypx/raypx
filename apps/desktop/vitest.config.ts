import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(
  defaults,
  defineConfig({
    // The bridge tests mock the SDK. Resolve their virtual module to the pure
    // contract so this independent runner does not require generated native SDKs.
    resolve: { alias: { "electrobun/view": resolve(import.meta.dirname, "native/rpc.ts") } },
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      maxWorkers: 3,
      // Native and script fixtures launch real subprocesses.
      testTimeout: 30_000,
    },
  }),
);
