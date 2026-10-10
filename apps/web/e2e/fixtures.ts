import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "playwright/test";

interface WorkerFixtures {
  serverURL: string;
}
interface TestFixtures {
  consoleGuard: void;
}

async function availablePort(): Promise<number> {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No E2E port available");
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function stop(server: ChildProcess): Promise<void> {
  if (!server.pid) return;
  const signal = (name: NodeJS.Signals) => {
    try {
      if (process.platform === "win32") server.kill(name);
      else process.kill(-server.pid!, name);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  };
  const closed =
    server.exitCode !== null || server.signalCode !== null
      ? Promise.resolve()
      : once(server, "close");
  signal("SIGTERM");
  const timeout = setTimeout(() => signal("SIGKILL"), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(timeout);
  }
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  serverURL: [
    // Playwright reads fixture dependencies from the required object binding.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, provideFixture, workerInfo) => {
      const port = await availablePort();
      const url = `http://127.0.0.1:${port}`;
      const production = workerInfo.project.name === "prod";
      const args = production
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
          ];
      const server = spawn("bun", args, {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        detached: process.platform !== "win32",
        env: {
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
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const collect = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-100_000);
      };
      server.stdout?.on("data", collect);
      server.stderr?.on("data", collect);
      let startupError: Error | undefined;
      server.on("error", (error) => {
        startupError = error;
      });
      try {
        const deadline = Date.now() + 45_000;
        let ready = false;
        while (Date.now() < deadline) {
          if (startupError) throw startupError;
          if (server.exitCode !== null) throw new Error(`E2E server exited: ${output}`);
          try {
            if ((await fetch(`${url}/api/ready`, { signal: AbortSignal.timeout(1000) })).ok) {
              ready = true;
              break;
            }
          } catch {
            /* Listener is still starting. */
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!ready) throw new Error(`E2E server did not become ready: ${output}`);
        await provideFixture(url);
      } finally {
        await stop(server);
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
