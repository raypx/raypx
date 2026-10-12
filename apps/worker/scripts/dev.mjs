import { context } from "esbuild";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleOptions } from "./build.mjs";

const workspace = join(dirname(fileURLToPath(import.meta.url)), "..");
const flags = process.argv.slice(2);
let child;
let stopped = false;
let restarting = Promise.resolve();
async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
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
    ["--enable-source-maps", join(workspace, "dist/index.mjs"), ...flags],
    { cwd: workspace, env: process.env, stdio: "inherit" },
  );
  child.on("error", () => {
    process.stderr.write("Worker Node host could not start.\n");
  });
}

// Smoke modes verify the same child executable without requiring a database.
if (flags.includes("--check") || flags.includes("--check-documents")) {
  await restart();
  const [code] = await once(child, "exit");
  process.exitCode = code ?? 1;
} else {
  const watcher = await context({
    ...bundleOptions,
    plugins: [
      ...bundleOptions.plugins,
      {
        name: "restart-node-host",
        setup(builder) {
          builder.onEnd((result) => {
            if (result.errors.length || stopped) return;
            restarting = restarting.then(restart);
            return restarting;
          });
        },
      },
    ],
  });
  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    void (async () => {
      await watcher.dispose();
      await restarting;
      await stopChild();
    })();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await watcher.watch();
  process.stdout.write(
    "Watching Worker workspace sources; restart dev after changing dependencies.\n",
  );
}
