import { taskArguments } from "@raypx-kit/devkit/tasks";
import crossSpawn from "cross-spawn";
import { readFileSync } from "node:fs";

// This bootstrap cannot depend on Runtime Node or Tooling, which consume the presets.
const name = process.argv[2];
if (!name) throw new Error("A workspace task name is required");
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
if (!manifest.scripts?.[name]) throw new Error(`Unknown workspace script: ${name}`);
const args = taskArguments(`${manifest.name}#${name}`, process.env);
process.exitCode = await new Promise<number>((resolve, reject) => {
  const child = crossSpawn("pnpm", ["run", name, ...args], {
    stdio: "inherit",
    windowsHide: true,
  });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  const cleanup = () => {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  };
  child.once("error", (error) => {
    cleanup();
    reject(error);
  });
  child.once("exit", (code) => {
    cleanup();
    resolve(code ?? 1);
  });
});
