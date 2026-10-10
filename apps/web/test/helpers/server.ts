import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

interface ProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  maxOutputChars?: number;
  stopTimeoutMs?: number;
}

interface ProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface TestProcess {
  process: ChildProcess;
  exited: Promise<ProcessExit>;
  readonly error: Error | undefined;
  output(): string;
  stop(): Promise<void>;
}

export interface TestServer extends TestProcess {
  baseURL: string;
}

interface ServerOptions extends Omit<ProcessOptions, "args" | "env"> {
  args: (port: number) => string[];
  env: (port: number) => NodeJS.ProcessEnv;
  readyPath?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
}

/** Launch only an owned test process, with explicit environment and bounded output. */
export function spawnTestProcess({
  command,
  args,
  cwd,
  env,
  maxOutputChars = 100_000,
  stopTimeoutMs = 5000,
}: ProcessOptions): TestProcess {
  const processUnderTest = spawn(command, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const collect = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-maxOutputChars);
  };
  processUnderTest.stdout.on("data", collect);
  processUnderTest.stderr.on("data", collect);
  let startupError: Error | undefined;
  processUnderTest.on("error", (error) => {
    startupError = error;
  });
  const exited = new Promise<ProcessExit>((resolve) => {
    processUnderTest.once("close", (code, signal) => resolve({ code, signal }));
  });
  const signal = (name: NodeJS.Signals) => {
    if (!processUnderTest.pid) return;
    try {
      if (process.platform === "win32") processUnderTest.kill(name);
      else process.kill(-processUnderTest.pid, name);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  };
  let stopping: Promise<void> | undefined;
  return {
    process: processUnderTest,
    exited,
    get error() {
      return startupError;
    },
    output: () => output,
    stop() {
      stopping ??= (async () => {
        signal("SIGTERM");
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            exited,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, stopTimeoutMs);
            }),
          ]);
        } finally {
          clearTimeout(timer);
          // Kill any owned descendants, including ones keeping output pipes open.
          signal("SIGKILL");
        }
        try {
          await Promise.race([
            exited,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 1000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
          processUnderTest.stdout.destroy();
          processUnderTest.stderr.destroy();
          processUnderTest.unref();
        }
      })();
      return stopping;
    },
  };
}

async function availablePort(): Promise<number> {
  const reservation = createServer();
  try {
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("No test port available");
    return address.port;
  } finally {
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

/** Start an isolated loopback service; unsuccessful startup always cleans up its process. */
export async function startTestServer({
  args,
  env,
  readyPath = "/api/health",
  startupTimeoutMs = 10_000,
  requestTimeoutMs = 500,
  pollIntervalMs = 50,
  ...options
}: ServerOptions): Promise<TestServer> {
  const port = await availablePort();
  const server = spawnTestProcess({ ...options, args: args(port), env: env(port) });
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      if (server.error) throw new Error("Test service could not start", { cause: server.error });
      if (server.process.exitCode !== null || server.process.signalCode !== null) {
        throw new Error(
          `Test service exited (${server.process.signalCode ?? server.process.exitCode}): ${server.output()}`,
        );
      }
      try {
        const response = await fetch(new URL(readyPath, baseURL), {
          redirect: "manual",
          signal: AbortSignal.timeout(
            Math.min(requestTimeoutMs, Math.max(1, deadline - Date.now())),
          ),
        });
        const ready = response.ok;
        await response.body?.cancel();
        if (ready) return { ...server, baseURL };
      } catch {
        // A refused connection is expected while the test service starts.
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(
      `Test service did not become ready within ${startupTimeoutMs}ms: ${server.output()}`,
    );
  } catch (error) {
    await server.stop();
    throw error;
  }
}
