import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { databaseUrl } from "./database.js";

type BrowserSuite = "all" | "web" | "desktop";
const repositoryRoot = resolve(import.meta.dirname, "..");
const basePort = Number(process.env.RAYPX_E2E_PORT ?? 3000);
const origin = (offset: number) => `http://127.0.0.1:${basePort + offset}`;
const offsets = { web: 0, desktop: 1, api: 2 } as const;

function server(app: keyof typeof offsets) {
  const offset = offsets[app];
  return {
    command: `bun run --cwd apps/${app} dev -- --host 127.0.0.1 --port ${basePort + offset}`,
    cwd: repositoryRoot,
    env: {
      RAYPX_REPOSITORY_ENV: repositoryRoot,
      ALLOWED_ORIGINS: `${origin(0)},${origin(1)}`,
      AUTH_SECRET: "e2e-only-secret-that-is-long-enough-for-better-auth",
      AUTH_URL: app === "api" ? origin(2) : origin(0),
      VITE_API_URL: origin(2),
      DATABASE_URL: databaseUrl(),
      NODE_ENV: "test",
      NITRO_PORT: String(basePort + offset),
    },
    url: `${origin(offset)}${app === "api" ? "/health" : ""}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  };
}

export function browserConfig(suite: BrowserSuite) {
  const projects = [
    {
      name: "web",
      testMatch:
        /(?:^|[\\/])(?:web|homepage|workbench|redesign|authenticated-web|cloud|session-revocation-cloud)\.spec\.ts$/,
      use: { baseURL: origin(0) },
    },
    {
      name: "desktop",
      testMatch: /(?:^|[\\/])desktop(?:-redesign)?\.spec\.ts$/,
      use: { baseURL: origin(1) },
    },
  ];
  const apps: Array<keyof typeof offsets> =
    suite === "all" ? ["api", "web", "desktop"] : ["api", suite];
  const reportFolder = suite === "all" ? "playwright-report" : `playwright-report/${suite}`;
  return defineConfig({
    globalSetup: "./database.ts",
    testDir: "./tests",
    ...(suite === "all" ? {} : { outputDir: `test-results/${suite}` }),
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI
      ? [["dot"], ["html", { open: "never", outputFolder: reportFolder }]]
      : "list",
    use: { trace: "on-first-retry", locale: "en-US" },
    projects: suite === "all" ? projects : projects.filter(({ name }) => name === suite),
    webServer: apps.map(server),
  });
}
