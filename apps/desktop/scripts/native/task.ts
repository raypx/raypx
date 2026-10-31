import { resolve } from "node:path";

const supplied = process.argv.slice(2);
const leaf = supplied[0] === "--leaf";
const [task, ...directArgs] = leaf ? supplied.slice(1) : supplied;
const bun = process.execPath;
const cwd = resolve(import.meta.dirname, "../..");
let commands: string[][];

const nativeGate =
  task &&
  ["native:smoke", "native:smoke:interactive", "native:beta", "native:agents"].includes(task);
if (
  task !== "check" &&
  task !== "native:build" &&
  task !== "build" &&
  task !== "build:renderer" &&
  task !== "dev" &&
  !nativeGate
)
  throw new Error(
    "Usage: scripts/native/task.ts <check|build|build:renderer|dev|native:build|native:smoke|native:smoke:interactive|native:beta|native:agents>",
  );

const argumentKey = `RAYPX_DESKTOP_${task === "build:renderer" ? "RENDERER" : task.toUpperCase().replaceAll(":", "_")}_ARGS`;
const forwarded = leaf ? process.env[argumentKey] : undefined;
const args: unknown = forwarded && directArgs.length === 0 ? JSON.parse(forwarded) : directArgs;
if (!Array.isArray(args) || args.some((value) => typeof value !== "string"))
  throw new Error("Desktop task arguments must be a string array");
if (
  task === "build:renderer" &&
  args.some((value) => /^(?:--(?:mode|outDir|config)(?:=|$)|-c$)/.test(value))
)
  throw new Error("The selected renderer task owns its mode and output directory");
// Scope Desktop arguments to its selected VP task, including dependency builds.
// Explicitly forward changes: Bun's default spawn environment is its startup snapshot.
const env = { ...process.env };
if (task !== "build:renderer") delete env.RAYPX_DESKTOP_BROWSER_BUILD;
if (!leaf) {
  if (args.length) env[argumentKey] = JSON.stringify(args);
  else delete env[argumentKey];
}

// Direct scripts enter VP; the private leaf invocation executes only this task.
if (!leaf) {
  commands = [[bun, "run", "raypx-dev", "tasks", `desktop#${task}`]];
} else if (task === "native:build") {
  commands = [[bun, "run", "mygo:build", ...args]];
} else if (task === "check") {
  commands = [
    [bun, "scripts/native/generate.ts", "--check"],
    [bun, "run", "typecheck"],
    [bun, "run", "typecheck:node", ...args],
  ];
} else if (task === "build") {
  commands = [
    [bun, "--bun", "vp", "build", "--config", "vite.app.config.ts", ...args],
    [bun, "run", "native:csp"],
  ];
} else if (task === "build:renderer") {
  // Start's prerender preview reloads Vite config without forwarding --mode.
  env.RAYPX_DESKTOP_BROWSER_BUILD = "1";
  commands = [
    [bun, "--bun", "vp", "build", "--config", "vite.app.config.ts", ...args, "--mode", "e2e"],
    [bun, "run", "native:csp", "artifacts/browser/client"],
  ];
} else if (nativeGate) {
  const scenario = task === "native:agents" ? "agents-run.ts" : "run.ts";
  const mode =
    task === "native:beta"
      ? ["beta"]
      : task === "native:smoke:interactive"
        ? ["--interactive"]
        : [];
  commands = [[bun, "run", `tests/native/smoke/${scenario}`, ...mode, ...args]];
} else {
  commands = [[bun, "run", "mygo:dev", ...args]];
}

for (const command of commands) {
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  let code: number;
  try {
    code = await child.exited;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
}
