import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenvx from "@dotenvx/dotenvx";
import { createJiti } from "jiti";
import yargsParser from "yargs-parser";
import type { Command } from "./lib/task";
import { formatDuration, PROJECT_ROOT } from "./utils";
import { logger } from "./utils/logger";

const jiti = createJiti(import.meta.url);

const globalOptions = [
  ["--help, -h", "Show this help message"],
  ["--debug, -d", "Enable debug logging"],
  ["--verbose, -V", "Enable verbose output"],
  ["--silent, -s", "Suppress all non-error output"],
] as const;

/**
 * Automatically discover available commands from cmd directory
 */
async function discoverCommands(): Promise<
  Record<string, { name: string; desc?: string; file: string }>
> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const cmdDir = join(__dirname, "cmd");

  try {
    const files = await readdir(cmdDir);
    const commands: Record<string, { name: string; desc?: string; file: string }> = {};

    for (const file of files) {
      if (!file.endsWith(".ts") || file === "index.ts") continue;

      const commandName = file.replace(/\.ts$/, "");
      const modulePath = `./cmd/${commandName}`;

      try {
        const module: Command = await jiti.import(modulePath, { default: true });
        commands[commandName] = {
          name: module?.cmd || commandName,
          desc: module?.description,
          file: modulePath,
        };
      } catch (_error) {
        // If import fails, use defaults
        commands[commandName] = { name: commandName, file: modulePath };
      }
    }

    return commands;
  } catch (error) {
    logger.debug("Failed to discover commands, using fallback", error);
    return {};
  }
}

/**
 * Show help information for a specific command
 */
async function showCommandHelp(commandInfo: {
  name: string;
  desc?: string;
  file: string;
}): Promise<void> {
  // Try to load the command module to get additional help info
  try {
    const cmd: Command = await jiti.import(commandInfo.file, { default: true });

    logger.log(`
Usage: raypx-scripts ${commandInfo.name}

${commandInfo.desc || "No description available"}
${cmd.help ? `\n${cmd.help}\n` : ""}
${
  cmd.examples
    ? `Examples:
${cmd.examples.map((ex) => `  $ ${ex}`).join("\n")}
`
    : ""
}Options:
${globalOptions.map(([flag, description]) => `  ${flag.padEnd(18)} ${description}`).join("\n")}
`);
  } catch (_error) {
    // Fallback to basic help if command module can't be loaded
    logger.log(`
Usage: raypx-scripts ${commandInfo.name}

${commandInfo.desc || "No description available"}

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

  logger.log(`
Usage: raypx-scripts <command> [args...]

Commands:`);
  Object.entries(commands).forEach(([_, info]) => {
    logger.log(`  ${info.name.padEnd(18)} ${info.desc || ""}`);
  });
  const options = globalOptions.map(([flag, description]) => `  ${flag.padEnd(18)} ${description}`);
  logger.log(`
Options:
${options.join("\n")}

Run 'raypx-scripts <command> --help' for more information on a specific command.
`);
}

/**
 * Parse command line arguments using yargs-parser
 *
 * IMPORTANT: This function is ONLY used to extract global flags (--help, --debug, --verbose)
 * It should NOT be used to parse command arguments, as it would strip flags
 * from subcommands (e.g., "bun --version" would become just "bun")
 *
 * For command arguments, we use rawArgs directly to preserve all flags and options.
 */
function parseArgs(args: string[]) {
  return yargsParser(args, {
    boolean: ["help", "debug", "verbose", "silent"],
    alias: {
      help: ["h"],
      debug: ["d"],
      verbose: ["V"],
      silent: ["s"],
    },
  });
}

const cliStartTime = Date.now();

/**
 * CLI entry point for raypx-scripts
 */
async function cli(rawArgs: string[]) {
  // Load environment variables from project root .env file
  // This makes .env available to all commands automatically
  dotenvx.config({ path: join(PROJECT_ROOT, ".env"), quiet: true });

  // Parse arguments to extract global flags (--help, --version, --debug, etc.)
  // Note: We use yargs-parser only for global flags, NOT for command arguments
  const parsed = parseArgs(rawArgs);

  // Extract command name and arguments directly from rawArgs
  // This preserves all arguments including flags like --version for subcommands
  // Example: ["run", "bun", "--version"] -> commandName="run", remainingArgs=["bun", "--version"]
  const [commandName, ...remainingArgs] = rawArgs as string[];

  // Discover available commands
  const commands = await discoverCommands();
  const cmdInfo = commands[commandName as keyof typeof commands];

  // Handle global help: no command or --help flag with no other args
  if (!commandName || !cmdInfo || (parsed.help && remainingArgs.length === 0)) {
    await showHelp();
    return;
  }

  // Handle command-level help: "raypx-scripts run --help"
  // Only if single --help flag and command exists
  if (parsed.help && remainingArgs.length === 1) {
    await showCommandHelp(cmdInfo);
    return;
  }

  // Enable debug logging if requested (global flag)
  if (parsed.debug) {
    process.env.DEBUG = "true";
  }

  // Enable silent mode if requested (global flag)
  logger.level = parsed.silent ? 0 : 4;

  // Get command file path
  const commandFile = cmdInfo?.file;

  // Validate command exists
  if (!commandFile) {
    logger.error(`Command '${commandName}' not found`);
    logger.log(`\nAvailable commands: ${Object.keys(commands).join(", ")}`);
    logger.log("Use 'raypx-scripts --help' for more information");
    process.exit(1);
  }

  try {
    // Load and execute command
    const cmd: Command = await jiti.import(commandFile, { default: true });
    const startTime = Date.now();
    logger.debug(`Command ${commandName} started in ${Date.now() - cliStartTime}ms`);

    // Execute the command with ALL remaining arguments preserved
    await cmd.run(remainingArgs);
    logger.debug(`Command ${commandName} completed in ${Date.now() - startTime}ms`);

    const totalDuration = Date.now() - startTime;
    logger.success(`Tasks completed in ${formatDuration(totalDuration)}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Command '${commandName}' failed: ${errorMessage}`);

    // Show debug info if available
    if (error instanceof Error && error.stack) {
      logger.debug("Error stack:", error.stack);
    }

    // Show helpful message for common errors
    if (errorMessage.includes("not found") || errorMessage.includes("ENOENT")) {
      logger.info("💡 Tip: Make sure the command exists and is properly configured");
    }

    process.exit(1);
  }
}

export default cli;
