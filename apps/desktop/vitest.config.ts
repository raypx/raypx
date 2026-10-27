import { resolve } from "node:path";
import { workspaceTests } from "../../test.config.js";

export default {
  ...workspaceTests({ maxWorkers: 3 }),
  // The bridge tests mock the SDK. Resolve their virtual module to the pure
  // contract so this independent runner does not require generated native SDKs.
  resolve: { alias: { "electrobun/view": resolve(import.meta.dirname, "native/rpc.ts") } },
};
