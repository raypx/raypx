import { taskArguments } from "@raypx-kit/devkit/tasks";
import { runProcess } from "@raypx/runtime-node/process";
import { readFileSync } from "node:fs";
import { taskScripts } from "./delegation.ts";
async function runTaskLeaf() {
  const name = process.argv[2];
  if (name === "--aggregate") return 0;
  if (!name) throw new Error("A workspace task name is required");
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  if (!manifest.scripts?.[name]) throw new Error(`Unknown workspace script: ${name}`);
  const args = taskArguments(`${manifest.name}#${name}`, process.env);
  const delegated = taskScripts(manifest)[name];
  const native = manifest.scripts["native:build"] && manifest.scripts["native:prepare"];
  const [binary, ...command] = delegated
    ? ["pnpm", "run", delegated, ...args]
    : native &&
        [
          "native:build",
          "check",
          "build",
          "build:renderer",
          "dev",
          "native:smoke",
          "native:smoke:interactive",
          "native:agents",
        ].includes(name)
      ? [
          process.execPath,
          "--import",
          import.meta.resolve("tsx"),
          "scripts/host/task.ts",
          "--leaf",
          name,
          ...args,
        ]
      : ["pnpm", "run", name, ...args];
  return runProcess(binary, command, process.cwd());
}
process.exitCode = await runTaskLeaf();
