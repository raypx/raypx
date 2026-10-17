import { workspaceTests } from "../../test.config.js";

// Pure native preference adapters do not need a renderer or an emulator.
export default workspaceTests({
  include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.ts"],
});
