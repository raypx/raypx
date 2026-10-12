import { createBuilder } from "vite-plus";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = join(dirname(fileURLToPath(import.meta.url)), "..");
const flags = process.argv.slice(2);
const smoke = flags.includes("--check") || flags.includes("--check-documents");
const watchers = new Set();
let child;
let stopped = false;
let restarting = Promise.resolve();
let starting = Promise.resolve();
let closing;

async function stopChild() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const previous = child;
  const exited = once(previous, "exit");
  previous.kill("SIGTERM");
  const timer = setTimeout(() => previous.kill("SIGKILL"), 15_000);
  timer.unref();
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

async function restart() {
  await stopChild();
  if (stopped) return;
  child = spawn(
    process.execPath,
    ["--no-env-file", "--no-install", join(workspace, ".output/server/index.mjs"), ...flags],
    {
      cwd: workspace,
      env: process.env,
      stdio: "inherit",
    },
  );
  await once(child, "spawn");
  return child;
}

function report(error) {
  process.exitCode = 1;
  if (error instanceof AggregateError) {
    for (const cause of error.errors) report(cause);
    return;
  }
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
}

function shutdown() {
  stopped = true;
  closing ??= (async () => {
    const setup = await Promise.allSettled([starting]);
    const restarts = await Promise.allSettled([restarting]);
    const host = await Promise.allSettled([stopChild()]);
    const disposed = await Promise.allSettled([...watchers].map((watcher) => watcher.close()));
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    const errors = [...setup, ...disposed, ...restarts, ...host]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, "Worker development shutdown failed.");
  })();
  return closing;
}

function onSignal() {
  void shutdown().catch(report);
}
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

starting = (async () => {
  const builder = await createBuilder({
    root: workspace,
    ...(smoke ? {} : { build: { watch: {} } }),
  });
  if (!smoke) {
    const build = builder.build;
    builder.build = async (environment) => {
      const result = await build(environment);
      if (environment.name === "nitro" && typeof result?.on === "function") {
        watchers.add(result);
        result.on("event", (event) => {
          if (event.code === "ERROR") {
            process.stderr.write("Worker build failed; keeping the current host running.\n");
          } else if (event.code === "BUNDLE_END" && !stopped) {
            // Nitro tracing finishes before this successful bundle has been written.
            restarting = restarting.then(restart);
            void restarting.catch(() => shutdown().catch(report));
          }
        });
      }
      return result;
    };
  }
  await builder.buildApp();
  if (smoke) {
    await restart();
  } else {
    process.stdout.write(
      "Watching Worker workspace sources; restart dev after changing dependencies.\n",
    );
  }
})();

try {
  await starting;
  if (smoke && child) {
    const [code] =
      child.exitCode !== null || child.signalCode !== null
        ? [child.exitCode]
        : await once(child, "exit");
    process.exitCode = code ?? 1;
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
} catch (error) {
  report(error);
  await shutdown().catch(report);
}
