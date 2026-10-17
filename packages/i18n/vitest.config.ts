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
          include: ["src/ssr.test.tsx", "src/**/*.test.ts"],
        },
      },
      {
        test: {
          ...shared.test,
          name: "browser",
          environment: "jsdom",
          include: ["src/client.test.tsx", "src/browser.component.test.tsx"],
        },
      },
    ],
  },
});
