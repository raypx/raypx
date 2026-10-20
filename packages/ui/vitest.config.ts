import { workspaceTests } from "../../test.config.js";

export default workspaceTests({
  environment: "jsdom",
  setupFiles: ["./tests/setup.ts"],
});
