import { defineCommand, renderUsage, runCommand as runCittyCommand, type CommandDef } from "citty";
import { createDeviceCommands } from "./device.js";
import { createDaemonCommands } from "./daemon.js";
import { globalArgs, type CliArgs } from "./args.js";
import { LocalError } from "../runtime/errors.js";
import type { RecordDiagnostic } from "../diagnostics.js";
import manifest from "../../package.json";
export async function runCommand(
  invocation: CliArgs,
  defaults: { dataDir?: string; profile?: string; recordDiagnostic?: RecordDiagnostic },
) {
  const options = { ...defaults, ...invocation.options };
  const groups = new Map<string, ReturnType<typeof createDeviceCommands>>([
    ["device", createDeviceCommands(invocation, options)],
    ["daemon", createDaemonCommands(invocation, options)],
  ]);
  const defineCliCommand = (definition: CommandDef) => defineCommand(definition);
  const root = defineCliCommand({
    meta: {
      name: "raypx",
      version: manifest.version,
      description: "Raypx device connector and Desktop session transport",
    },
    args: globalArgs,
    subCommands: Object.fromEntries([...groups].map(([name, group]) => [name, group.command])),
  });
  if (invocation.version) {
    if (invocation.positionals.length || invocation.help)
      throw new Error("--version must be used alone");
    console.log(manifest.version);
    return;
  }
  const [name, action, ...inputs] = invocation.positionals;
  if (!name || name === "help" || invocation.help || !action) {
    const path = name === "help" ? invocation.positionals.slice(1) : invocation.positionals;
    if (path.length > 2) throw new Error("Help accepts a command group and action");
    const group = path[0] ? groups.get(path[0]) : undefined;
    const target = path[1] ? group?.leaves.get(path[1]) : path[0] ? group?.command : root;
    if (!target) throw new LocalError("UNKNOWN_COMMAND", "Unknown command; use raypx --help");
    console.log(await renderUsage(target, target === root ? undefined : root));
    return;
  }
  const leaf = groups.get(name)?.leaves.get(action);
  if (!leaf) throw new LocalError("UNKNOWN_COMMAND", "Unknown command; use raypx --help");
  await runCittyCommand(leaf, { rawArgs: ["--", ...inputs] });
}
