import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { databaseUrl } from "./database.js";
import { browserProjects, type BrowserSuite } from "./test-groups.js";

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
  const group = process.env.RAYPX_E2E_GROUP;
  const projects = browserProjects(suite, group).map((project) => ({
    ...project,
    use: { baseURL: origin(offsets[project.name]) },
  }));
  const apps: Array<keyof typeof offsets> = ["api", ...projects.map(({ name }) => name)];
  const listOnly = process.argv.includes("--list");
  const shardIndex = process.argv.indexOf("--shard");
  const shardArg =
    process.argv.find((arg) => arg.startsWith("--shard="))?.slice("--shard=".length) ??
    (shardIndex === -1 ? undefined : process.argv[shardIndex + 1]);
  const shard =
    shardArg && /^\d+\/\d+$/.test(shardArg) ? `shard-${shardArg.replace("/", "-of-")}` : undefined;
  const reportScope = [suite === "all" ? "" : suite, group, shard].filter(Boolean).join("/");
  const reportFolder = reportScope ? `playwright-report/${reportScope}` : "playwright-report";
  return defineConfig({
    ...(listOnly ? {} : { globalSetup: "./database.ts", webServer: apps.map(server) }),
    testDir: "./tests",
    ...(reportScope ? { outputDir: `test-results/${reportScope}` } : {}),
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI
      ? [["dot"], ["html", { open: "never", outputFolder: reportFolder }]]
      : "list",
    use: { trace: "on-first-retry", locale: "en-US" },
    projects,
  });
}
