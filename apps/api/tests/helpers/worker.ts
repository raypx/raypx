import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { pinnedNode } from "@raypx/tooling/repository";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

function launch(databaseURL: string, mode: string, action: string) {
  const child = spawn(
    pinnedNode(root),
    [fileURLToPath(import.meta.resolve("@raypx/tooling/cloudflare")), root, action],
    {
      cwd: root,
      env: { ...process.env, TEST_DATABASE_URL: databaseURL, TEST_DATABASE_MODE: mode },
      stdio: ["ignore", action === "--serve-api" ? "pipe" : "ignore", "pipe"],
    },
  );
  let diagnostic = "";
  child.stderr!.on("data", (chunk: Buffer) => {
    diagnostic = (diagnostic + chunk.toString())
      .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[DATABASE_URL]")
      .slice(-2000);
  });
  return {
    child,
    failure: (code: number | null) => new Error(`Worker fixture exited ${code}: ${diagnostic}`),
  };
}

async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}

export async function startWorker(databaseURL: string, mode: string) {
  const { child, failure } = launch(databaseURL, mode, "--serve-api");
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let pending = "";
      const timer = setTimeout(
        () => reject(new Error("Worker PostgreSQL fixture startup timed out")),
        60_000,
      );
      const cleanup = () => clearTimeout(timer);
      child.stdout!.on("data", (chunk: Buffer) => {
        pending += chunk.toString();
        let offset: number;
        while ((offset = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, offset);
          pending = pending.slice(offset + 1);
          try {
            const message = JSON.parse(line) as { type?: string; url?: string };
            if (message.type === "raypx-worker-ready" && message.url) {
              cleanup();
              resolve(message.url);
            }
          } catch {
            // Wrangler may also print diagnostic lines.
          }
        }
      });
      child.once("error", (error) => {
        cleanup();
        reject(error);
      });
      child.once("exit", (code) => {
        cleanup();
        reject(failure(code));
      });
    });
    return { base, close: () => stop(child) };
  } catch (error) {
    await stop(child);
    throw error;
  }
}

export async function runWorkerSchedule(
  databaseURL: string,
  mode: string,
  task: "cleanup" | "schedules",
) {
  const { child, failure } = launch(databaseURL, mode, `--run-api-${task}`);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(failure(code));
    });
  });
}
