import { taskArguments } from "@raypx/devkit/tasks";
import { readFileSync } from "node:fs";
import { runProcess } from "../src/process.js";

const name = process.argv[2];
if (!name) throw new Error("A workspace task name is required");
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
if (!manifest.scripts?.[name]) throw new Error(`Unknown workspace script: ${name}`);
const args = taskArguments(`${manifest.name}#${name}`, process.env);
process.exitCode = await runProcess(process.execPath, ["run", name, ...args], process.cwd());
