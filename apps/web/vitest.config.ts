import { workspaceTestProjects } from "../../test.config.js";

export default workspaceTestProjects([
  { name: "unit", include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"] },
  {
    name: "component",
    environment: "jsdom",
    include: ["tests/component/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
]);
