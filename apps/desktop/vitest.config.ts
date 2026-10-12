import { resolve } from "node:path";
import { workspaceTests } from "../../test.config.js";

export default {
  ...workspaceTests({ include: ["src/**/*.{test,spec}.{ts,tsx}", "native/**/*.test.ts"] }),
  // The bridge tests mock the SDK. Resolve their virtual module to the pure
  // contract so this independent runner does not require generated native SDKs.
  resolve: { alias: { "electrobun/view": resolve(import.meta.dirname, "native/rpc.ts") } },
};
