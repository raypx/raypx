import { createInterface } from "node:readline/promises";
import { defineCommand, renderUsage, runCommand as runCittyCommand, type CommandDef } from "citty";
import type { LocalMethod } from "@raypx/contracts/local";
import manifest from "../../package.json";
import { LocalError } from "../runtime/errors";
import type { RecordDiagnostic } from "../diagnostics";
import { globalArgs, type CliArgs } from "./args";
import { createAiCommands } from "./ai";

type PublicMethod = Exclude<LocalMethod, "runtime.info" | `terminal.${string}`>;
type Operation = {
  method: PublicMethod;
  description: string;
  directory?: boolean;
};

// Public commands are deliberate API surface, not every method in localParams.
const operations = {
  roots: {
    list: { method: "roots.list", description: "List authorized directories" },
    register: { method: "roots.register", description: "Authorize a directory from JSON params" },
    remove: { method: "roots.remove", description: "Revoke a directory grant" },
  },
  files: {
    roots: { method: "roots.list", description: "List authorized directories" },
    authorize: {
      method: "roots.register",
      description: "Authorize an absolute directory",
      directory: true,
    },
    list: { method: "files.list", description: "List entries in an authorized directory" },
    stat: { method: "files.stat", description: "Read file metadata" },
    read: { method: "files.read", description: "Read a UTF-8 text file" },
    write: { method: "files.write", description: "Write text with a version precondition" },
    mkdir: { method: "files.mkdir", description: "Create a directory" },
    move: { method: "files.move", description: "Move a path with a version precondition" },
    delete: { method: "files.delete", description: "Delete a path after confirmation" },
  },
  jobs: {
    list: { method: "jobs.list", description: "List local jobs" },
    create: { method: "jobs.create", description: "Create a local job" },
    update: { method: "jobs.update", description: "Update a local job" },
    delete: { method: "jobs.delete", description: "Delete a job definition" },
    run: { method: "jobs.run", description: "Run a job once and wait for its result" },
    history: { method: "jobs.history", description: "Read a job's recent runs" },
  },
  tools: {
    run: { method: "tools.run", description: "Run an external command from JSON params" },
    cancel: { method: "tools.cancel", description: "Cancel a tool in the current runtime" },
  },
} satisfies Record<string, Record<string, Operation>>;

type RuntimeOptions = { dataDir?: string; profile?: string; recordDiagnostic?: RecordDiagnostic };

// The registry contains heterogeneous commands, so give their definitions a
// common contextual type rather than retaining incompatible literal generics.
function defineCliCommand(definition: CommandDef) {
  return defineCommand(definition);
}

export async function runCommand(invocation: CliArgs, defaults: RuntimeOptions) {
  const options = { ...defaults, ...invocation.options };
  const groups = new Map<string, { command: CommandDef; leaves: Map<string, CommandDef> }>();
  for (const [group, definitions] of Object.entries(operations)) {
    const leaves = new Map<string, CommandDef>();
    for (const [action, operation] of Object.entries<Operation>(definitions)) {
      leaves.set(
        action,
        defineCliCommand({
          meta: { name: `${group} ${action}`, description: operation.description },
          args: {
            ...globalArgs,
            input: {
              type: "positional",
              description: operation.directory ? "Absolute directory" : "JSON params",
              required: Boolean(operation.directory),
            },
          },
          async run({ args }) {
            if (args._.length > 1) throw new Error("Expected at most one input argument");
            await executeOperation(operation, args._[0], invocation, options);
          },
        }),
      );
    }
    groups.set(group, {
      leaves,
      command: defineCliCommand({
        meta: { name: group, description: `Local ${group} commands` },
        args: globalArgs,
        subCommands: Object.fromEntries(leaves),
      }),
    });
  }
  groups.set("ai", createAiCommands(invocation));
  const stdio = defineCliCommand({
    meta: { name: "stdio", description: "Private Desktop NDJSON transport", hidden: true },
    args: globalArgs,
    async run() {
      if (invocation.json || invocation.yes)
        throw new Error("stdio only accepts --profile and --data-dir");
      const { serveStdio } = await import("../transport/stdio");
      await serveStdio(options);
    },
  });
  const tui = defineCliCommand({
    meta: { name: "tui", description: "Browse and run local tasks interactively" },
    args: globalArgs,
    async run() {
      if (invocation.json || invocation.yes)
        throw new LocalError("INTERACTIVE_REQUIRED", "tui cannot be combined with --json or --yes");
      const { runTui } = await import("../tui");
      process.exitCode = await runTui(options);
    },
  });
  const root = defineCliCommand({
    meta: { name: "raypx", version: manifest.version, description: "Raypx local CLI" },
    args: globalArgs,
    subCommands: {
      ...Object.fromEntries([...groups].map(([name, group]) => [name, group.command])),
      stdio,
      tui,
    },
  });
  const [group, action, ...inputs] = invocation.positionals;
  if (invocation.version) {
    if (invocation.positionals.length || invocation.help)
      throw new Error("--version must be used without a command or --help");
    console.log(manifest.version);
    return;
  }
  if (
    !group ||
    group === "help" ||
    invocation.help ||
    (!action && group !== "stdio" && group !== "tui")
  ) {
    const path = group === "help" ? invocation.positionals.slice(1) : invocation.positionals;
    if (path.length > 2) throw new Error("Help accepts a command group and action");
    let target: CommandDef = root;
    if (path[0]) {
      const entry = groups.get(path[0]);
      target =
        path[0] === "stdio"
          ? stdio
          : path[0] === "tui"
            ? tui
            : (entry?.command ?? unknownCommand());
      if (path[1]) target = entry?.leaves.get(path[1]) ?? unknownCommand();
    }
    console.log(
      (await renderUsage(target, target === root ? undefined : root)) +
        "\n\nJSON params remain supported. File deletion requires --yes or an interactive confirmation.\nJobs execute once; scheduling requires Desktop.",
    );
    return;
  }
  if (group === "stdio") {
    if (invocation.positionals.length !== 1)
      throw new Error("stdio does not accept positional arguments");
    await runCittyCommand(stdio, { rawArgs: [] });
    return;
  }
  if (group === "tui") {
    if (invocation.positionals.length !== 1)
      throw new Error("tui does not accept positional arguments");
    await runCittyCommand(tui, { rawArgs: [] });
    return;
  }
  if (!action || !groups.get(group)?.leaves.has(action)) unknownCommand();
  // Global options have already been validated and extracted. The payload is
  // opaque positional data, including tokens that originally followed `--`.
  await runCittyCommand(root, { rawArgs: [group, action, "--", ...inputs] });
}

function unknownCommand(): never {
  throw new LocalError("UNKNOWN_COMMAND", "Unknown command; use raypx --help");
}

async function executeOperation(
  operation: Operation,
  input: string | undefined,
  invocation: CliArgs,
  options: RuntimeOptions,
) {
  let params: unknown = operation.directory ? { path: input } : JSON.parse(input ?? "{}");
  if (operation.method === "files.delete") {
    let confirmed = invocation.yes;
    if (!confirmed && process.stdin.isTTY && !invocation.json) {
      const prompt = createInterface({ input: process.stdin, output: process.stderr });
      try {
        confirmed = (await prompt.question("Delete this path permanently? Type yes: ")) === "yes";
      } finally {
        prompt.close();
      }
    }
    if (!confirmed)
      throw new LocalError(
        "CONFIRMATION_REQUIRED",
        "Deletion requires --yes or interactive confirmation",
      );
    params = { ...(params as Record<string, unknown>), confirmed: true };
  }
  const { localParams } = await import("@raypx/contracts/local");
  params = localParams[operation.method].parse(params);
  const { createRuntime } = await import("../runtime");
  const runtime = createRuntime(options);
  const stop = () => {
    void runtime.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const result = await runtime.request(operation.method, params);
    console.log(JSON.stringify(result, null, invocation.json ? undefined : 2));
  } finally {
    await runtime.close();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
