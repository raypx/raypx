import { workspaceTests } from "../../test.config.js";

export default workspaceTests({
  environment: "jsdom",
  setupFiles: ["./src/test/setup.ts"],
});
