import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { taskArguments } from "./arguments.js";

const [name] = process.argv.slice(2);
if (name === "--aggregate") process.exit(0);
if (!name) throw new Error("A workspace task name is required");
const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
if (!manifest.scripts?.[name]) throw new Error(`Unknown workspace script: ${name}`);
const args = taskArguments(`${manifest.name}#${name}`, process.env);
const native = manifest.scripts["native:prepare"] && manifest.scripts["typecheck:native"];
const command =
  native && ["check", "build", "build:renderer", "dev"].includes(name)
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
