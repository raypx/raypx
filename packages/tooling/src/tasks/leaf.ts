import { runTaskLeaf } from "@raypx-kit/devkit/tasks";

const command = process.argv.slice(3);
if (!command.length) throw new Error("A workspace task runner is required");
process.exitCode = await runTaskLeaf({
  runtime: process.execPath,
  command(_, _name, args) {
    return [process.execPath, "run", ...command, ...args];
  },
});
