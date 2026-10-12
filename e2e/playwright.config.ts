import { databaseUrl } from "./database.js";
import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const basePort = Number(process.env.VOIDMIX_E2E_PORT ?? 3000);
const origin = (offset: number) => `http://127.0.0.1:${basePort + offset}`;
const webUrl = origin(0);
const desktopUrl = origin(1);
const apiUrl = origin(2);

function server(app: "api" | "web" | "desktop", offset: number) {
  return {
    command: `bun run --cwd apps/${app} dev -- --host 127.0.0.1 --port ${basePort + offset}`,
    cwd: repositoryRoot,
    env: {
      VOIDMIX_REPOSITORY_ENV: repositoryRoot,
      ALLOWED_ORIGINS: `${webUrl},${desktopUrl}`,
      AUTH_SECRET: "e2e-only-secret-that-is-long-enough-for-better-auth",
      AUTH_URL: app === "api" ? apiUrl : webUrl,
      VITE_API_URL: apiUrl,
      DATABASE_URL: databaseUrl(),
      NODE_ENV: "test",
      NITRO_PORT: String(basePort + offset),
    },
    url: `${origin(offset)}${app === "api" ? "/health" : ""}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  };
}

export default defineConfig({
  globalSetup: "./database.ts",
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["dot"], ["html", { open: "never" }]] : "list",
  use: { trace: "on-first-retry", locale: "en-US" },
  projects: [
    { name: "cloud", testMatch: /cloud\.spec\.ts/, use: { baseURL: webUrl } },
    { name: "homepage", testMatch: /homepage\.spec\.ts/, use: { baseURL: webUrl } },
    { name: "workbench", testMatch: /workbench\.spec\.ts/, use: { baseURL: webUrl } },
    { name: "redesign", testMatch: /redesign\.spec\.ts/, use: { baseURL: webUrl } },
    { name: "web", testMatch: /(?:^|\/)web\.spec\.ts/, use: { baseURL: webUrl } },
    { name: "authenticated", testMatch: /authenticated-web\.spec\.ts/, use: { baseURL: webUrl } },
    { name: "admin", testMatch: /admin\.spec\.ts/, use: { baseURL: webUrl } },
    { name: "desktop", testMatch: /desktop\.spec\.ts/, use: { baseURL: desktopUrl } },
  ],
  webServer: [server("api", 2), server("web", 0), server("desktop", 1)],
});
