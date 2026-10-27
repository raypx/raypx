import { workspaceTestProjects } from "../../test.config.js";

export default workspaceTestProjects(
  [
    { name: "unit", include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"] },
    {
      name: "component",
      environment: "happy-dom",
      include: ["tests/component/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./tests/setup.ts"],
    },
  ],
  { maxWorkers: 3 },
);
