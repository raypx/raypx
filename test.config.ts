import { defineConfig } from "vite-plus/test/config";

/** Runner-only defaults; application Vite plugins never enter the test process. */
export function workspaceTests(
  options: {
    environment?: "node" | "jsdom";
    include?: string[];
    env?: Record<string, string>;
    setupFiles?: string[];
  } = {},
) {
  return defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      coverage: { reporter: ["text", "json", "lcov"] },
      ...options,
    },
  });
}
