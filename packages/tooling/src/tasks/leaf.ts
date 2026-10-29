import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { taskArguments } from "./arguments.js";
import { taskScripts } from "./delegation.js";

const [name] = process.argv.slice(2);
if (name === "--aggregate") process.exit(0);
if (!name) throw new Error("A workspace task name is required");
const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
if (!manifest.scripts?.[name]) throw new Error(`Unknown workspace script: ${name}`);
const args = taskArguments(`${manifest.name}#${name}`, process.env);
const native = manifest.scripts["native:build"] && manifest.scripts["native:prepare"];
const delegated = taskScripts(manifest)[name];
const command = delegated
  ? [process.execPath, "run", delegated, ...args]
  : native &&
      [
        "native:build",
        "check",
        "build",
        "build:renderer",
        "dev",
        "native:smoke",
        "native:smoke:interactive",
        "native:beta",
        "native:agents",
      ].includes(name)
    ? [process.execPath, "run", "scripts/native/task.ts", "--leaf", name, ...args]
    : [process.execPath, "run", name, ...args];
const child = Bun.spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
const interrupt = () => child.kill("SIGINT");
const terminate = () => child.kill("SIGTERM");
process.once("SIGINT", interrupt);
process.once("SIGTERM", terminate);
try {
  process.exitCode = await child.exited;
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
}
