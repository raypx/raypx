import { workspaceTests } from "../../test.config.js";

export default workspaceTests({
  environment: "happy-dom",
  setupFiles: ["./tests/setup.ts"],
  maxWorkers: 3,
});
