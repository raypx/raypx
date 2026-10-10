import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  installedCommands,
  isBootstrapCommand,
  printBootstrapUsage,
  runBootstrapCommand,
  toolVersion,
} from "../lib/cli/bootstrap.ts";

const root = resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), "../..");
const args = process.argv.slice(2);
const name = args[0];

if (isBootstrapCommand(name)) runBootstrapCommand(name, args.slice(1), root);
else if (args.length === 1 && (name === "--version" || name === "-v"))
  console.log(toolVersion(root));
else {
  const help = args.length === 0 || (args.length === 1 && (name === "--help" || name === "-h"));
  if (!help && (!name || !Object.hasOwn(installedCommands, name))) {
    console.error("Unknown command or root option. Use raypx --help.");
    process.exitCode = 1;
  } else if (!existsSync(join(root, "node_modules/citty/package.json"))) {
    if (help) printBootstrapUsage(root);
    else {
      console.error("Repository tooling is not installed. Run bun install first.");
      process.exitCode = 1;
    }
  } else {
    try {
      const { runCli } = await import("../cli.ts");
      await runCli(args);
    } catch {
      console.error("Repository tooling could not start. Run bun install and try again.");
      process.exitCode = 1;
    }
  }
}
