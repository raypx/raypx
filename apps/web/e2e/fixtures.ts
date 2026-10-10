import { fileURLToPath } from "node:url";
import { test as base, expect } from "playwright/test";
import { startTestServer } from "../test/helpers/server.ts";

interface WorkerFixtures {
  serverURL: string;
}
interface TestFixtures {
  consoleGuard: void;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  serverURL: [
    // Playwright reads fixture dependencies from the required object binding.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, provideFixture, workerInfo) => {
      const production = workerInfo.project.name === "prod";
      const server = await startTestServer({
        command: "bun",
        args: (port) =>
          production
            ? ["--no-env-file", ".output/server/index.mjs"]
            : [
                "--no-env-file",
                "run",
                "vp",
                "dev",
                "--mode",
                "e2e",
                "--host",
                "127.0.0.1",
                "--port",
                String(port),
                "--strictPort",
              ],
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: (port) => ({
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          SystemRoot: process.env.SystemRoot,
          HOST: "127.0.0.1",
          PORT: String(port),
          NITRO_PORT: String(port),
          NODE_ENV: production ? "production" : "development",
          AUTH_ENABLED: "false",
          METRICS_ENABLED: "false",
          LOG_LEVEL: "error",
          APP_VERSION: "e2e-synthetic",
        }),
        readyPath: "/api/ready",
        startupTimeoutMs: 45_000,
        requestTimeoutMs: 1000,
        pollIntervalMs: 100,
      });
      try {
        await provideFixture(server.baseURL);
      } finally {
        await server.stop();
      }
    },
    { scope: "worker", timeout: 60_000 },
  ],
  baseURL: async ({ serverURL }, provideFixture) => {
    await provideFixture(serverURL);
  },
  consoleGuard: [
    async ({ page }, provideFixture) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !/^Failed to load resource: the server responded with a status of (404|500)\b/.test(
            message.text(),
          )
        )
          errors.push(message.text());
      });
      await provideFixture();
      expect(errors, "Unexpected browser console or hydration errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
