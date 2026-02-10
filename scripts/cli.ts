import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenvx from "@dotenvx/dotenvx";
import { createJiti } from "jiti";
import yargsParser from "yargs-parser";
import type { Command } from "./lib/task";
import { formatDuration, PROJECT_ROOT } from "./utils";
import { logger } from "./utils";

const jiti = createJiti(import.meta.url);

const globalOptions = [
  ["--help, -h", "Show this help message"],
  ["--debug, -d", "Enable debug logging"],
  ["--verbose, -V", "Enable verbose output"],
  ["--silent, -s", "Suppress all non-error output"],
] as const;

type CommandInfo = {
  name: string;
  desc?: string;
  file: string;
};

/**
 * Automatically discover available commands from cmd directory
 */
async function discoverCommands(): Promise<Record<string, CommandInfo>> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const cmdDir = join(__dirname, "cmd");

  try {
    const files = await readdir(cmdDir);
    const commands: Record<string, CommandInfo> = {};

    for (const file of files) {
      if (!file.endsWith(".ts") || file === "index.ts") continue;

      const commandName = file.replace(/\.ts$/, "");
      const modulePath = `./cmd/${commandName}`;

      try {
        const module: Command = await jiti.import(modulePath, { default: true });
        commands[commandName] = {
          name: module?.cmd ?? commandName,
          desc: module?.description,
          file: modulePath,
        };
      } catch {
        commands[commandName] = { name: commandName, file: modulePath };
      }
    }

    return commands;
  } catch (error) {
    logger.debug("Failed to discover commands", error);
    return {};
  }
}

/**
 * Show help information for a specific command
 */
async function showCommandHelp(commandInfo: CommandInfo): Promise<void> {
  try {
    const cmd: Command = await jiti.import(commandInfo.file, { default: true });

    const optionsText = globalOptions
      .map(([flag, description]) => `  ${flag.padEnd(18)} ${description}`)
      .join("\n");

    const examplesText = cmd.examples
      ? `Examples:\n${cmd.examples.map((ex) => `  $ ${ex}`).join("\n")}\n`
      : "";

    logger.log(`
Usage: raypx-scripts ${commandInfo.name}

${commandInfo.desc ?? "No description available"}
${cmd.help ? `\n${cmd.help}\n` : ""}
${examplesText}Options:
${optionsText}
`);
  } catch {
    logger.log(`
Usage: raypx-scripts ${commandInfo.name}

${commandInfo.desc ?? "No description available"}

Options:
  --help, -h     Show this help message
`);
  }
}

/**
 * Show global help information
 */
async function showHelp(): Promise<void> {
  const commands = await discoverCommands();

  const commandsText = Object.values(commands)
    .map(({ name, desc }) => `  ${name.padEnd(18)} ${desc ?? ""}`)
    .join("\n");

  const optionsText = globalOptions
    .map(([flag, description]) => `  ${flag.padEnd(18)} ${description}`)
    .join("\n");

  logger.log(`
Usage: raypx-scripts <command> [args...]

Commands:
${commandsText}

Options:
${optionsText}

Run 'raypx-scripts <command> --help' for more information on a specific command.
`);
}

/**
 * Parse command line arguments for global flags only
 */
function parseArgs(args: string[]) {
  return yargsParser(args, {
    boolean: ["help", "debug", "verbose", "silent"],
    alias: { help: ["h"], debug: ["d"], verbose: ["V"], silent: ["s"] },
  });
}

const cliStartTime = Date.now();

/**
 * CLI entry point for raypx-scripts
 */
async function cli(rawArgs: string[]) {
  // Load environment variables from project root
  dotenvx.config({ path: join(PROJECT_ROOT, ".env"), quiet: true });

  const parsed = parseArgs(rawArgs);
  const [commandName, ...remainingArgs] = rawArgs;

  const commands = await discoverCommands();
  const cmdInfo = commands[commandName ?? ""];

  // Handle global help
  if (!commandName || !cmdInfo || (parsed.help && remainingArgs.length === 0)) {
    await showHelp();
    return;
  }

  // Handle command-level help
  if (parsed.help && remainingArgs.length === 1) {
    await showCommandHelp(cmdInfo);
    return;
  }

  // Apply global flags
  if (parsed.debug) process.env.DEBUG = "true";
  if (parsed.silent) logger.level = 0;

  const commandFile = cmdInfo?.file;
  if (!commandFile) {
    logger.error(`Command '${commandName}' not found`);
    logger.log(`\nAvailable commands: ${Object.keys(commands).join(", ")}`);
    process.exit(1);
  }

  try {
    const cmd: Command = await jiti.import(commandFile, { default: true });
    const startTime = Date.now();

    await cmd.run(remainingArgs);

    logger.success(`Tasks completed in ${formatDuration(Date.now() - startTime)}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Command '${commandName}' failed: ${errorMessage}`);

    if (error instanceof Error && error.stack) {
      logger.debug("Error stack:", error.stack);
    }

    if (errorMessage.includes("not found") || errorMessage.includes("ENOENT")) {
      logger.info(
        "💡 Tip: Make sure the command exists and is properly configured",
      );
    }

    process.exit(1);
  }
}

export default cli;
