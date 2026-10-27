import { workspaceTestProjects } from "../../test.config.js";

export default workspaceTestProjects([
  { name: "server", include: ["tests/node/**/*.{test,spec}.{ts,tsx}"] },
  {
    name: "browser",
    environment: "happy-dom",
    include: ["tests/browser/**/*.{test,spec}.{ts,tsx}"],
  },
]);
