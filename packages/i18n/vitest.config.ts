import { workspaceTests } from "../../test.config.js";
import { defineConfig } from "vite-plus/test/config";

const shared = workspaceTests();

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    include: [],
    projects: [
      {
        test: {
          ...shared.test,
          name: "server",
          environment: "node",
          include: ["tests/node/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        test: {
          ...shared.test,
          name: "browser",
          environment: "jsdom",
          include: ["tests/browser/**/*.{test,spec}.{ts,tsx}"],
        },
      },
    ],
  },
});
