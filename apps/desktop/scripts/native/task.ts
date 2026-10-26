import { resolve } from "node:path";

const [task, ...directArgs] = process.argv.slice(2);
const bun = process.execPath;
const cwd = resolve(import.meta.dirname, "../..");
let commands: string[][];

if (task !== "check" && task !== "build" && task !== "build:renderer" && task !== "dev")
  throw new Error("Usage: scripts/native/task.ts <check|build|build:renderer|dev>");

const argumentKey = `RAYPX_DESKTOP_${task === "build:renderer" ? "RENDERER" : task.toUpperCase()}_ARGS`;
const inTurbo = Boolean(process.env.TURBO_HASH);
const forwarded = inTurbo ? process.env[argumentKey] : undefined;
const args: unknown = forwarded && directArgs.length === 0 ? JSON.parse(forwarded) : directArgs;
if (!Array.isArray(args) || args.some((value) => typeof value !== "string"))
  throw new Error("Desktop task arguments must be a string array");
if (
  task === "build:renderer" &&
  args.some((value) => /^(?:--(?:mode|outDir|config)(?:=|$)|-c$)/.test(value))
)
  throw new Error("Renderer acceptance owns its mode and output directory");
// Turbo's passthrough arguments also reach dependency tasks with the same name.
// A per-task, hashed environment field keeps Desktop flags out of the CLI build.
const env = { ...process.env };
if (!inTurbo) {
  if (args.length) env[argumentKey] = JSON.stringify(args);
  else delete env[argumentKey];
}

// Turbo supplies TURBO_HASH only while executing a task. Direct workspace
// scripts enter the same graph; tasks already in that graph run only their leaf.
if (!inTurbo) {
  commands = [[bun, "run", "raypx-dev", "tasks", `desktop#${task}`]];
} else if (task === "check") {
  commands = [
    [bun, "run", "typecheck"],
    [bun, "run", "typecheck:node"],
    [bun, "run", "typecheck:native", ...args],
  ];
} else if (task === "build") {
  commands = [
    [bun, "run", "raypx-dev", "env", "--", bun, "--bun", "vp", "build", ...args],
    [bun, "run", "native:csp"],
  ];
} else if (task === "build:renderer") {
  // Start's prerender preview reloads Vite config without forwarding --mode.
  env.RAYPX_DESKTOP_BROWSER_BUILD = "1";
  commands = [
    [bun, "run", "raypx-dev", "env", "--", bun, "--bun", "vp", "build", ...args, "--mode", "e2e"],
    [bun, "run", "native:csp", "artifacts/browser/client"],
  ];
} else {
  commands = [
    [bun, "run", "native:cli"],
    [bun, "run", "raypx-dev", "env", "--", bun, "run", "scripts/native/dev.ts", ...args],
  ];
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
